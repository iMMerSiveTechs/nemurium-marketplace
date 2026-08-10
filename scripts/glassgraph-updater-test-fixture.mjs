import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as signEd25519,
} from "node:crypto";

const ED25519_SPKI_PREFIX_LENGTH = Buffer.from(
  "302a300506032b6570032100",
  "hex",
).length;

export const createGlassGraphUpdaterTestFixture = (artifact) => {
  const keyId = Buffer.from("0102030405060708", "hex");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPublicKey = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(ED25519_SPKI_PREFIX_LENGTH);
  assert.equal(rawPublicKey.length, 32);
  const publicKeyRecord = Buffer.concat([
    Buffer.from("Ed", "ascii"),
    keyId,
    rawPublicKey,
  ]);
  const publicKeyEnvelope = [
    "untrusted comment: GlassGraph updater test key",
    publicKeyRecord.toString("base64"),
    "",
  ].join("\n");
  const encodedPublicKey = Buffer.from(publicKeyEnvelope, "utf8").toString(
    "base64",
  );

  const signArtifact = (
    bytes,
    trustedComment = "timestamp:0 file:GlassGraph Studio.app.tar.gz",
  ) => {
    const artifactSignature = signEd25519(
      null,
      createHash("blake2b512").update(bytes).digest(),
      privateKey,
    );
    const globalSignature = signEd25519(
      null,
      Buffer.concat([
        artifactSignature,
        Buffer.from(trustedComment, "utf8"),
      ]),
      privateKey,
    );
    const signatureRecord = Buffer.concat([
      Buffer.from("ED", "ascii"),
      keyId,
      artifactSignature,
    ]);
    const signatureEnvelope = [
      "untrusted comment: signature from GlassGraph updater test key",
      signatureRecord.toString("base64"),
      `trusted comment: ${trustedComment}`,
      globalSignature.toString("base64"),
      "",
    ].join("\n");
    return Buffer.from(signatureEnvelope, "utf8").toString("base64");
  };
  return {
    publicKey: encodedPublicKey,
    publicKeySha256: createHash("sha256")
      .update(encodedPublicKey)
      .digest("hex"),
    signature: signArtifact(artifact),
    signArtifact,
  };
};
