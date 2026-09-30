import type { ContractConfig } from '@internal/config/config-types';
import { mongoContract } from '@internal/mongo-contract-psl/provider';

export interface Prisma6ContractOptions {
  readonly output?: string;
}

export function prisma6Contract(
  schemaPath: string,
  options: Prisma6ContractOptions = {},
): ContractConfig {
  return mongoContract(schemaPath, options);
}