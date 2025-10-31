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
    const staked = await stakeContract?.read.stakingBalance([Pid, address])
    //@ts-ignore
    const [requestAmount, pendingWithdrawAmount] = await stakeContract.read.withdrawAmount([Pid, address]);
    const ava = Number(formatUnits(pendingWithdrawAmount, 18))
    const p = Number(formatUnits(requestAmount, 18))
    console.log({ p, ava })
    setUserData({
      staked: formatUnits(staked as bigint, 18),
      withdrawPending: (p - ava).toFixed(4),
      withdrawable: ava.toString()
    })
  }

  useEffect(() => {
    if (stakeContract && address) {
      getUserData()
    }
  }, [address, stakeContract])
  const handleUnStake = async () => {
    if (!stakeContract || !data) return;
    try {
      setUnstakeLoading(true)
      const tx = await stakeContract.write.unstake([Pid, parseUnits(amount, 18)])
      const res = await waitForTransactionReceipt(data, { hash: tx })
      toast.success('Transaction receipt !')
      setUnstakeLoading(false)
      getUserData()
    } catch (error) {
      setUnstakeLoading(false)
      console.log(error, 'stake-error')
    }
  }
  const handleWithdraw = async () => {
    if (!stakeContract || !data) return;
    try {
      setWithdrawLoading(true)
      const tx = await stakeContract.write.withdraw([Pid])
      const res = await waitForTransactionReceipt(data, { hash: tx })
      console.log(res, 'withdraw-res')
      toast.success('Transaction receipt !')
      setWithdrawLoading(false)
      getUserData()
    } catch (error) {
      setWithdrawLoading(false)
      console.log(error, 'stake-error')
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