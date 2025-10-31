'use client'

import { Box, Button, Typography } from "@mui/material"

import { ConnectButton } from "@rainbow-me/rainbowkit"
import Link from "next/link"
import { usePathname } from "next/navigation"

const Header = () => {
  const Links = [
    { name: 'Stake', path: '/' },
    { name: 'Withdraw', path: '/withdraw' },
  ]
  const pathname = usePathname()
  
  return (
    <Box sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      p: '16px 60px',
      background: 'rgba(10, 22, 40, 0.8)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      position: 'relative',
      zIndex: 10
    }}>
      <Box display={'flex'} alignItems={'center'} gap={'40px'}>
        <Typography sx={{ 
          fontSize: '28px', 
          fontWeight: 'bold',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #5b9cff 75%, #00d4ff 100%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '0 0 30px rgba(91, 156, 255, 0.5)',
          letterSpacing: '1px',
          animation: 'gradient 3s ease infinite',
          backgroundSize: '200% 200%',
          '@keyframes gradient': {
            '0%': { backgroundPosition: '0% 50%' },
            '50%': { backgroundPosition: '100% 50%' },
            '100%': { backgroundPosition: '0% 50%' }
          }
        }}
        >
          MetaNode
          <Typography 
            component="span"
            sx={{ 
              color: '#ffffff',
              textShadow: '0 0 20px rgba(255, 255, 255, 0.8)',
              ml: 1,
              fontSize: 'inherit',
              fontWeight: 'inherit'
            }}
          >
            Stake
          </Typography>
        </Typography>
        
        <Box display={'flex'} gap={'30px'}>
          {Links.map(link => {
            const active = (pathname === link.path || pathname === link.path + '/');
            return (
              <Link key={link.name} href={link.path}>
                <Typography sx={{
                  fontSize: '16px',
                  color: active ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                  fontWeight: active ? '600' : '400',
                  cursor: link.path === '#' ? 'not-allowed' : 'pointer',
                  transition: 'color 0.3s',
                  '&:hover': {
                    color: '#fff'
                  },
                  borderBottom: active ? '2px solid #5b9cff' : 'none',
                  pb: '4px'
                }}>
                  {link.name}
                </Typography>
              </Link>
            )
          })}
        </Box>
      </Box>

      <Box display={'flex'} gap={'15px'} alignItems={'center'}>
        <ConnectButton />
      </Box>
    </Box>
  )
}

export default Header