'use client'

import { Box, Button, TextField, Typography } from "@mui/material"
import { formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useWalletClient } from "wagmi";
import { useCallback, useEffect, useState } from "react";

import LoadingButton from '@mui/lab/LoadingButton';
import { Pid } from "../../utils";
import { toast } from "react-toastify";
import { useStakeContract } from "../../hooks/useContract";
import { waitForTransactionReceipt } from "viem/actions";

const Home = () => {
  const stakeContract = useStakeContract()
  const { address, isConnected } = useAccount()
  const [stakedAmount, setStakedAmount] = useState('0')
  const [amount, setAmount] = useState('0')
  const [loading, setLoading] = useState(false)
  const { data } = useWalletClient()
  const { data: balance } = useBalance({ address: address })

  const handleStake = async () => {
    if (!stakeContract || !data) return;
    if (parseFloat(amount) > parseFloat(balance!.formatted)) {
      toast.error('Amount cannot be greater than current balance')
      return
    }
    try {
      setLoading(true)
      const tx = await stakeContract.write.depositETH([], { value: parseUnits(amount, 18) })
      const res = await waitForTransactionReceipt(data, { hash: tx })
      toast.success('Transaction receipt !')
      setLoading(false)
      getStakedAmount()
    } catch (error) {
      setLoading(false)
      console.log(error, 'stake-error')
    }
  }

  const getStakedAmount = useCallback(async () => {
    if (address && stakeContract) {
      const res = await stakeContract?.read.stakingBalance([Pid, address])
      setStakedAmount(formatUnits(res as bigint, 18))
    }
  }, [stakeContract, address])

  useEffect(() => {
    if (stakeContract && address) {
      getStakedAmount()
    }
  }, [stakeContract, address])

  const StatCard = ({ title, value, subtitle, trend }: any) => (
    <Box sx={{
      background: 'rgba(15, 30, 50, 0.6)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '16px',
      p: '24px',
      backdropFilter: 'blur(10px)'
    }}>
      <Typography sx={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', mb: '8px' }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: '32px', fontWeight: 'bold', mb: '8px', color: '#fff' }}>
        {value}
      </Typography>
      {subtitle && (
        <Typography sx={{ fontSize: '14px', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>↑</span> {subtitle}
        </Typography>
      )}
    </Box>
  )

return (
    <Box sx={{ 
      minHeight: 'calc(100vh - 70px)',
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      gap: '60px',
      width: '100%',
      p: '40px 60px',
      position: 'relative',
      zIndex: 1
    }}>
      {/* 左侧内容 */}
      <Box sx={{ flex: 1, maxWidth: '600px' }}>
        <Typography sx={{ 
          fontSize: '48px',
          fontWeight: 'bold', 
          lineHeight: 1.2,
          mb: '24px',
          color: '#fff'
        }}>
          Earn Up to <span style={{ color: '#5b9cff' }}>7.46%</span> Rewards
        </Typography>
        
        <Typography sx={{ 
          fontSize: '18px', 
          color: 'rgba(255, 255, 255, 0.7)',
          mb: '32px',
          lineHeight: 1.6
        }}>
          Stake your MetaNode tokens and earn passive income with our secure and efficient staking platform.
        </Typography>

        <Box display={'flex'} gap={'20px'} mb={'32px'}>
          <Button sx={{
            background: 'linear-gradient(135deg, #5b9cff 0%, #4a7fd9 100%)',
            color: '#fff',
            px: '32px',
            py: '14px',
            fontSize: '16px',
            fontWeight: '600',
            borderRadius: '12px',
            textTransform: 'none',
            '&:hover': {
              background: 'linear-gradient(135deg, #4a8bef 0%, #3968c9 100%)',
            }
          }}>
            ⚡ Start Staking
          </Button>
          
          <Button sx={{
            background: 'linear-gradient(135deg, #f59e42 0%, #e8873d 100%)',
            color: '#fff',
            px: '32px',
            py: '14px',
            fontSize: '16px',
            fontWeight: '600',
            borderRadius: '12px',
            textTransform: 'none',
            '&:hover': {
              background: 'linear-gradient(135deg, #e58d32 0%, #d8772d 100%)',
            }
          }}>
            ℹ️ Learn More
          </Button>
        </Box>

        <Box display={'flex'} alignItems={'center'} gap={'16px'}>
          <Box display={'flex'} sx={{ '& > *': { ml: '-8px' } }}>
            {[1, 2, 3].map(i => (
              <Box key={i} sx={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: `hsl(${i * 30}, 70%, 60%)`,
                border: '2px solid #0a1628'
              }} />
            ))}
          </Box>
          <Box>
            <Typography sx={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}>
              Trusted by over 10,000 users
            </Typography>
            <Typography sx={{ fontSize: '16px', color: '#fbbf24' }}>
              ⭐⭐⭐⭐⭐ 4.8/5
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* 右侧数据卡片 */}
      <Box sx={{ flex: 1, maxWidth: '550px' }}>
        <Box sx={{
          background: 'rgba(15, 30, 50, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          p: '32px',
          backdropFilter: 'blur(10px)'
        }}>
          <Box display={'flex'} justifyContent={'space-between'} alignItems={'center'} mb={'24px'}>
            <Typography sx={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>
              Current Staking Stats
            </Typography>
            <Box sx={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}>
              ℹ️
            </Box>
          </Box>

          <Box display={'grid'} gridTemplateColumns={'1fr 1fr'} gap={'16px'} mb={'24px'}>
            <StatCard 
              title="Total Staked" 
              value={`${parseFloat(stakedAmount).toFixed(2)} ETH`}
              subtitle="12.5% from last week"
            />
            <StatCard 
              title="Annual Reward Rate" 
              value="7.46%"
              subtitle="0.8% from last week"
            />
          </Box>

          <Box display={'grid'} gridTemplateColumns={'1fr 1fr'} gap={'16px'} mb={'32px'}>
            <StatCard 
              title="Active Validators" 
              value="158"
              subtitle="3 new validators"
            />
            <Box sx={{
              background: 'rgba(15, 30, 50, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              p: '24px',
              backdropFilter: 'blur(10px)'
            }}>
              <Typography sx={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', mb: '8px' }}>
                Network Status
              </Typography>
              <Typography sx={{ fontSize: '24px', fontWeight: 'bold', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  width: '12px', 
                  height: '12px', 
                  borderRadius: '50%', 
                  background: '#4ade80',
                  display: 'inline-block'
                }} />
                Online
              </Typography>
              <Typography sx={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', mt: '8px' }}>
                ✓ All systems operational
              </Typography>
            </Box>
          </Box>

          {/* Stake Input */}
          <Box sx={{
            background: 'rgba(15, 30, 50, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            p: '24px'
          }}>
            <Typography sx={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', mb: '12px' }}>
              Stake Amount
            </Typography>
            <TextField 
              fullWidth
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              type="number"
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  '& fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#5b9cff',
                  }
                }
              }}
            />
            <Typography sx={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', mt: '8px' }}>
              Balance: {balance?.formatted || '0'} ETH
            </Typography>
            
            
            <Box mt={'20px'}>
              <LoadingButton 
                fullWidth
                disabled={!isConnected}
                loading={loading}
                onClick={handleStake}
                sx={{
                  background: 'linear-gradient(135deg, #5b9cff 0%, #4a7fd9 100%)',
                  color: '#fff',
                  py: '14px',
                  fontSize: '16px',
                  fontWeight: '600',
                  borderRadius: '12px',
                  textTransform: 'none',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #4a8bef 0%, #3968c9 100%)',
                  }
                }}
              >
                {!isConnected ? 'Connect Wallet First' : 'Stake Now'}
              </LoadingButton>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

export default Home