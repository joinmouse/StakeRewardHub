import { Box } from "@mui/material";
import Header from "./Header";
import ParticleBackground from "./ParticleBackground";
import { ReactNode } from "react";
import styles from '../styles/Home.module.css';
import { useRouter } from "next/router";

export default function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();
  
  // Check if current page needs particle background (home, index, or withdraw)
  const shouldShowParticles = router.pathname === '/' || 
                             router.pathname === '/home' || 
                             router.pathname === '/withdraw';

  return (
    <Box className={styles.container} sx={{ position: 'relative', minHeight: '100vh' }}>
      {shouldShowParticles && <ParticleBackground />}
      <Header />
      <main className={styles.main}>
        {children}
      </main>
    </Box>
  )
}