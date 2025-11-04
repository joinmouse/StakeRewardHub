import { Box, Grid, TextField, Typography } from "@mui/material";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LoadingButton } from "@mui/lab";
import { NextPage } from "next";
import { Pid } from "../../utils";
import { toast } from "react-toastify";
import { useStakeContract } from "../../hooks/useContract";
import { waitForTransactionReceipt } from "viem/actions";

export type UserStakeData = {
  staked: string,
  withdrawPending: string,
  withdrawable: string
}

const InitData = {
  staked: '0',
  withdrawable: '0',
  withdrawPending: '0'
}

const Withdraw: NextPage = () => {
  const stakeContract = useStakeContract()
  const { address, isConnected } = useAccount()
  const [amount, setAmount] = useState('0')
  const [unstakeLoading, setUnstakeLoading] = useState(false)
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const { data } = useWalletClient()
  const [userData, setUserData] = useState<UserStakeData>(InitData)

  const isWithdrawable = useMemo(() => {
    return Number(userData.withdrawable) > 0 && isConnected
  }, [userData, isConnected])

  const getUserData = async () => {
    if (!stakeContract || !address) return;
    try {
      // 🚀 优化: 并行获取数据，减少网络请求次数
      const [staked, withdrawData] = await Promise.all([
        stakeContract.read.stakingBalance([Pid, address]),
        stakeContract.read.withdrawAmount([Pid, address])
      ])
      
      //@ts-ignore
      const [requestAmount, pendingWithdrawAmount] = withdrawData;
      const ava = Number(formatUnits(pendingWithdrawAmount, 18))
      const p = Number(formatUnits(requestAmount, 18))
      console.log({ p, ava })
      setUserData({
        staked: formatUnits(staked as bigint, 18),
        withdrawPending: (p - ava).toFixed(4),
        withdrawable: ava.toString()
      })
    } catch (error) {
      console.error('Failed to fetch user data:', error)
    }
  }

  useEffect(() => {
    if (stakeContract && address) {
      getUserData()
    }
  }, [address, stakeContract])
  const handleUnStake = async () => {
    if (!stakeContract || !data) return;
    if (parseFloat(amount) > parseFloat(userData.staked)) {
      toast.error('Amount cannot be greater than staked balance')
      return
    }
    try {
      setUnstakeLoading(true)
      
      // 🚀 优化: gas预估
      const gasEstimate = await stakeContract.estimateGas.unstake(
        [Pid, parseUnits(amount, 18)],
        { account: stakeContract.account }
      )
      
      toast.info('Submitting unstake request...')
      
      const tx = await stakeContract.write.unstake([Pid, parseUnits(amount, 18)], {
        gas: gasEstimate + BigInt(Math.floor(Number(gasEstimate) * 0.1))
      })
      
      toast.success(`Unstake submitted: ${tx.slice(0, 10)}...`)
      
      // 🚀 优化: 异步处理
      waitForTransactionReceipt(data, { hash: tx })
        .then((receipt) => {
          toast.success('Unstake successful! Wait 20 minutes to withdraw.')
          getUserData()
        })
        .catch((error) => {
          console.error('Unstake failed:', error)
          toast.error('Unstake failed')
        })
        .finally(() => {
          setUnstakeLoading(false)
        })
        
    } catch (error) {
      setUnstakeLoading(false)
      console.log(error, 'unstake-error')
      
      // 🚀 优化: 详细错误处理
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          toast.error('Insufficient balance for gas')
        } else if (error.message.includes('rejected')) {
          toast.error('Transaction rejected by user')
        } else {
          toast.error(`Unstake failed: ${error.message.slice(0, 50)}...`)
        }
      } else {
        toast.error('Unstake failed')
      }
    }
  }
  const handleWithdraw = async () => {
    if (!stakeContract || !data) return;
    try {
      setWithdrawLoading(true)
      
      // 🚀 优化: gas预估
      const gasEstimate = await stakeContract.estimateGas.withdraw(
        [Pid],
        { account: stakeContract.account }
      )
      
      toast.info('Processing withdrawal...')
      
      const tx = await stakeContract.write.withdraw([Pid], {
        gas: gasEstimate + BigInt(Math.floor(Number(gasEstimate) * 0.1))
      })
      
      toast.success(`Withdrawal submitted: ${tx.slice(0, 10)}...`)
      
      // 🚀 优化: 异步处理
      waitForTransactionReceipt(data, { hash: tx })
        .then((receipt) => {
          console.log(receipt, 'withdraw-res')
          toast.success('Withdrawal successful!')
          getUserData()
        })
        .catch((error) => {
          console.error('Withdrawal failed:', error)
          toast.error('Withdrawal failed')
        })
        .finally(() => {
          setWithdrawLoading(false)
        })
        
    } catch (error) {
      setWithdrawLoading(false)
      console.log(error, 'withdraw-error')
      
      // 🚀 优化: 详细错误处理
      if (error instanceof Error) {
        if (error.message.includes('no locked')) {
          toast.error('No funds available for withdrawal yet')
        } else if (error.message.includes('insufficient funds')) {
          toast.error('Insufficient balance for gas')
        } else if (error.message.includes('rejected')) {
          toast.error('Transaction rejected by user')
        } else {
          toast.error(`Withdrawal failed: ${error.message.slice(0, 50)}...`)
        }
      } else {
        toast.error('Withdrawal failed')
      }
    }
  }

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      p: '40px 20px',
      minHeight: 'calc(100vh - 70px)',
      position: 'relative',
      zIndex: 1
    }}>
      <Box display={'flex'} flexDirection={'column'} alignItems={'center'} width={'100%'}
      >
        <Typography sx={{ fontSize: '30px', fontWeight: 'bold', mb: 2, color: '#fff' }}>MetaNode  Stake</Typography>
        <Typography sx={{ mb: 4, color: 'rgba(255, 255, 255, 0.7)'}}>Stake ETH to earn tokens.</Typography>
        <Box sx={{ 
          border: '1px solid rgba(255, 255, 255, 0.2)', 
          borderRadius: '12px', 
          p: '20px', 
          width: '600px', 
          mt: '20px',
          background: 'rgba(15, 30, 50, 0.6)',
          backdropFilter: 'blur(10px)'
        }}
        >
          <Grid container sx={{
            mb: '60px',
            '& .title': {
              fontSize: '15px',
              mb: '5px',
              color: 'rgba(255, 255, 255, 0.6)'
            },
            '& .val': {
              fontSize: '18px',
              fontWeight: 'bold',
              color: '#fff'
            }
          }}
          >
            <Grid item xs={4}>
              <Box display={'flex'} alignItems={'center'} flexDirection={'column'}>
                <Box className='title'>Staked Amount: </Box>
                <Box className='val'>{userData.staked} ETH</Box>
              </Box>
            </Grid>
            <Grid item xs={4}>
              <Box display={'flex'} alignItems={'center'} flexDirection={'column'}>
                <Box className='title'>Available to withdraw </Box>
                <Box className='val'>{userData.withdrawable} ETH</Box>
              </Box>
            </Grid>
            <Grid item xs={4}>
              <Box display={'flex'} alignItems={'center'} flexDirection={'column'}>
                <Box className='title'>Pending Withdraw: </Box>
                <Box className='val'>{userData.withdrawPending} ETH</Box>
              </Box>
            </Grid>
          </Grid>
          <Box sx={{ fontSize: '20px', mb: '10px', color: '#fff' }}>Unstake</Box>
          <TextField 
            onChange={(e) => {
              setAmount(e.target.value)
            }} 
            sx={{ 
              minWidth: '300px',
              '& .MuiOutlinedInput-root': {
                color: '#fff',
                '& fieldset': {
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                },
                '&:hover fieldset': {
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#5b9cff',
                }
              },
              '& .MuiInputLabel-root': {
                color: 'rgba(255, 255, 255, 0.7)',
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: '#5b9cff',
              }
            }} 
            label="Amount" 
            variant="outlined" 
          />
          
          <Box mt='20px'>
            <LoadingButton 
              variant='contained' 
              disabled={!isConnected}
              loading={unstakeLoading} 
              onClick={handleUnStake}
              sx={{
                background: 'linear-gradient(135deg, #5b9cff 0%, #4a7fd9 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #4a8bef 0%, #3968c9 100%)',
                }
              }}
            >
              {!isConnected ? 'Connect Wallet First' : 'UnStake'}
            </LoadingButton>
          </Box>
          <Box sx={{ fontSize: '20px', mb: '10px', mt: '40px', color: '#fff' }}>Withdraw</Box>
          <Box sx={{ color: 'rgba(255, 255, 255, 0.8)' }}> Ready Amount: {userData.withdrawable} </Box>
          <Typography fontSize={'14px'} color={'rgba(255, 255, 255, 0.6)'}>After unstaking, you need to wait 20 minutes to withdraw.</Typography>
          <LoadingButton 
            sx={{ 
              mt: '20px',
              background: 'linear-gradient(135deg, #f59e42 0%, #e8873d 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #e58d32 0%, #d8772d 100%)',
              }
            }} 
            disabled={!isWithdrawable} 
            variant='contained' 
            loading={withdrawLoading} 
            onClick={handleWithdraw}
          >
            Withdraw
          </LoadingButton>
        </Box>
      </Box>
    </Box>
  )
}

export default Withdraw