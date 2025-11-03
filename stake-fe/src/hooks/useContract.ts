import { Abi, Address } from "viem"
import { useChainId, useWalletClient } from "wagmi"

import { StakeContractAddress } from "../utils/env"
import { getContract } from "../utils/contractHelper"
import { stakeAbi } from '../assets/abis/stake'
import { useMemo } from "react"

type UseContractOptions = {
  chainId?: number
}

export function useContract<TAbi extends Abi>(
  addressOrAddressMap?: Address | { [chainId: number]: Address },
  abi?: TAbi,
  options?: UseContractOptions,
) {
  const currentChainId = useChainId()
  const chainId = options?.chainId || currentChainId
  const { data: walletClient } = useWalletClient()

  return useMemo(() => {
    if (!addressOrAddressMap || !abi || !chainId) return null
    let address: Address | undefined
    if (typeof addressOrAddressMap === 'string') address = addressOrAddressMap
    else address = addressOrAddressMap[chainId]
    if (!address) return null
    try {
      return getContract({
        abi,
        address,
        chainId,
        signer: walletClient ?? undefined,
      })
    } catch (error) {
      console.error('Failed to get contract', error)
      return null
    }
  }, [addressOrAddressMap, abi, chainId, walletClient])
}

export const useStakeContract = () => {
  console.log("StakeContractAddress", StakeContractAddress)
  return useContract(StakeContractAddress, stakeAbi as Abi)
}