import type { ContractConfig } from '@internal/config/config-types';
import { prisma6Contract } from '@internal/mongo-contract-prisma6';

export function prisma6Schema(schemaPath: string): ContractConfig {
  return prisma6Contract(schemaPath);
}
