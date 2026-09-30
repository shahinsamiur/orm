import { MONGO_INT32_CODEC_ID, MONGO_STRING_CODEC_ID } from '@internal/adapter-mongo/codec-ids';
import mongoAdapter from '@internal/adapter-mongo/control';
import type { PrismaNextConfig, ContractConfig } from '@internal/config/config-types';
import { defineConfig as coreDefineConfig } from '@internal/config/config-types';
import mongoDriver from '@internal/driver-mongo/control';
import { mongoFamilyDescriptor } from '@internal/family-mongo/control';
import { mongoContract } from '@internal/mongo-contract-psl/provider';
import { typescriptContractFromPath } from '@internal/mongo-contract-ts/config-types';
import { mongoTargetDescriptor } from '@internal/target-mongo/control';
import { ifDefined } from '@internal/utils/defined';
import { extname, join } from 'pathe';
import type { ControlExtensionDescriptor } from '@internal/framework-components/control';

export interface MongoConfigOptions {
  readonly contract: string | ContractConfig;
  readonly output?: string;
  readonly db?: { readonly connection?: string };
  readonly extensions?: readonly ControlExtensionDescriptor<'mongo', 'mongo'>[];
  readonly migrations?: { readonly dir?: string };
}

function deriveOutputPath(contractPath: string): string {
  const ext = extname(contractPath);
  if (ext.length === 0) return `${contractPath}.json`;
  return `${contractPath.slice(0, -ext.length)}.json`;
}

function resolveContractConfig(
  contract: string | ContractConfig,
  output?: string,
): ContractConfig {
  if (typeof contract !== 'string') {
    return contract;
  }

  const contractOutput =
    output !== undefined
      ? join(output, 'contract.json')
      : deriveOutputPath(contract);

  const ext = extname(contract);

  if (ext === '.ts') {
    return typescriptContractFromPath(contract, contractOutput);
  }

  return mongoContract(contract, {
    output: contractOutput,
    enumInferenceCodecs: {
      text: MONGO_STRING_CODEC_ID,
      int: MONGO_INT32_CODEC_ID,
    },
  });
}

export function defineConfig(options: MongoConfigOptions): PrismaNextConfig<'mongo', 'mongo'> {
  const extensions = options.extensions ?? [];

  return coreDefineConfig({
    family: mongoFamilyDescriptor,
    target: mongoTargetDescriptor,
    adapter: mongoAdapter,
    driver: mongoDriver,
    extensions,
    contract: resolveContractConfig(options.contract, options.output),
    ...ifDefined('db', options.db),
    ...ifDefined('migrations', options.migrations),
  });
}