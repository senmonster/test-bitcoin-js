import { RegtestUtils } from "regtest-client";
import "dotenv";
const APIPASS = process.env.APIPASS || "satoshi";
// const APIURL = process.env.APIURL || "https://coinfaucet.eu/en/btc-testnet/";
const APIURL = process.env.APIURL || "https://regtest.bitbank.cc/1";

export const regtestUtils = new RegtestUtils({ APIPASS, APIURL });
