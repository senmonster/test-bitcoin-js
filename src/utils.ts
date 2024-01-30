import * as bitcoin from 'bitcoinjs-lib';
import { base, signUtil } from '@okxweb3/crypto-lib';

export type Operation = 'init' | 'create' | 'modify' | 'revoke';
export type Encryption = '0' | '1' | '2';
// type MetaidDataOutput = [
// 	"metaid", // chain flag
// 	Operation, // operation type
// 	string, // path to operate, exp: /root/protocols/SimpleBuzz
// 	Encryption, // content的加密类型，0为不加密；1为ECIES加密，2为ECDH协商密钥加密
// 	string, // version
// 	string, // optional，content-type，default: application/jason
// 	string, // optional, encoding, default: utf8
// 	string // payload : stringify json body
// ];

// const toHexString = (s: string) => {
//   return Buffer.from(s).toString('hex');
// };
const toBuffer = (s: string): Buffer => {
  return Buffer.from(s);
};

export function private2public(privateKey: string) {
  return signUtil.secp256k1.publicKeyCreate(base.fromHex(privateKey), true);
}

const ops = bitcoin.script.OPS;

export function buildDataOutput({
  publicKey,
  operation,
  path,
  encryption = '0',
  version = '1.0.0',
  body,
  dataType = 'application/json',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  encoding = 'UTF-8',
}: {
  publicKey: Buffer;
  operation: Operation;
  path?: string;
  encryption?: '0' | '1' | '2';
  version?: string;
  body?: unknown;
  dataType?: string;
  encoding?: string;
}) {
  const dataArray: bitcoin.payments.StackElement[] = [];
  dataArray.push(publicKey);
  dataArray.push(ops.OP_CHECKSIG);
  dataArray.push(ops.OP_FALSE);
  dataArray.push(ops.OP_IF);
  dataArray.push(toBuffer('metaid'));
  dataArray.push(toBuffer(operation));
  if (operation !== 'init') {
    dataArray.push(toBuffer(path!));
    dataArray.push(toBuffer(encryption));
    dataArray.push(toBuffer(version));
    dataArray.push(toBuffer(dataType));

    body = toBuffer(JSON.stringify(body!));
    const maxChunkSize = 520;
    const bodySize = (body as Buffer).length;
    for (let i = 0; i < bodySize; i += maxChunkSize) {
      let end = i + maxChunkSize;
      if (end > bodySize) {
        end = bodySize;
      }
      dataArray.push((body as Buffer).slice(i, end));
    }
  }
  dataArray.push(ops.END_IF);
  // const leafScriptAsm = `${toXOnly(leafKey.publicKey).toString("hex")} OP_CHECKSIG`;
  // const leafScript = bitcoin.script.fromASM(leafScriptAsm);

  // const dataOutput: MetaidDataOutput = [
  // 	"metaid", // chain flag
  // 	operation, // operation type
  // 	path, // path to operate, exp:  /protocols/SimpleBuzz
  // 	encryption, // content的加密类型，0为不加密；1为ECIES加密，2为ECDH协商密钥加密
  // 	"1.0.0", // version
  // 	dataType, // optional，content-type，default: application/jason
  // 	encoding, // optional, encoding, default: utf8
  // 	JSON.stringify(body), // payload : stringify json body]
  // ];
  return dataArray;
}

export const hexToString = (hex: string) => {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const hexValue = hex.substr(i, 2);
    const decimalValue = parseInt(hexValue, 16);
    str += String.fromCharCode(decimalValue);
  }
  return str;
};
