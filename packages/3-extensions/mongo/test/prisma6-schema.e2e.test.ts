import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeContractEmit } from "@internal/cli/control-api";
import {
  defineConfig as ormConfig,
  prisma6Schema,
} from "../src/exports/config";
import { createMongoControlClient } from "../src/exports/control";

describe("Prisma 6 Mongo schema — e2e", () => {
  let replSet: MongoMemoryReplSet;
  let tmpDir: string;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    tmpDir = await mkdtemp(join(process.cwd(), ".tmp-prisma6-mongo-"));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await replSet.stop();
  });

  it("emits, verifies, and signs a Prisma 6 Mongo schema", async () => {
    const schemaPath = join(tmpDir, "schema.prisma");
    const outputPath = join(tmpDir, "generated");
    const connection = replSet.getUri("prisma6_contract_test");

    await writeFile(
      schemaPath,
      `datasource db {
  provider = "mongodb"
  url = env("DATABASE_URL")
}

model User {
  id String @id @default(auto()) @map("_id") @db.ObjectId
  email String @unique
  name String

  @@index([name])
  @@index([email, name])
}
`,
      "utf8",
    );

    const mongo = new MongoClient(connection);
    await mongo.connect();

    try {
      const db = mongo.db("prisma6_contract_test");

      await db.createCollection("User", {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            additionalProperties: false,
            properties: {
              _id: {
                bsonType: "objectId",
              },
              email: {
                bsonType: "string",
              },
              name: {
                bsonType: "string",
              },
            },
            required: ["_id", "email", "name"],
          },
        },
        validationLevel: "strict",
        validationAction: "error",
      });

      await db
        .collection("User")
        .createIndex({ email: 1 }, { name: "User_email_key", unique: true });
      await db
        .collection("User")
        .createIndex({ name: 1 }, { name: "User_name_idx" });
      await db
        .collection("User")
        .createIndex({ email: 1, name: 1 }, { name: "User_email_name_idx" });

      const indexes = await db.collection("User").listIndexes().toArray();

      expect(indexes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "User_email_key",
            unique: true,
          }),
          expect.objectContaining({
            name: "User_name_idx",
          }),
          expect.objectContaining({
            name: "User_email_name_idx",
          }),
        ]),
      );
    } finally {
      await mongo.close();
    }

    const config = ormConfig({
      contract: prisma6Schema(schemaPath),
    });
    let emitted;

    emitted = await executeContractEmit({
      config,
      cwd: tmpDir,
      outputPath,
    });

    expect(emitted.files.json).toBe(join(outputPath, "contract.json"));
    expect(emitted.files.dts).toBe(join(outputPath, "contract.d.ts"));

    const contractJson = JSON.parse(await readFile(emitted.files.json, "utf8"));

    expect(contractJson).toBeDefined();

    const control = createMongoControlClient({
      connection,
    });

    try {
      const verified = await control.schemaVerify({
        contract: contractJson,
        connection,
        strict: false,
      });

      expect(verified.ok).toBe(true);
    } finally {
      await control.close();
    }

    const signingControl = createMongoControlClient({
      connection,
    });

    try {
      const signed = await signingControl.sign({
        contract: contractJson,
        connection,
      });

      expect(signed.ok).toBe(true);
    } finally {
      await signingControl.close();
    }
  });
});
