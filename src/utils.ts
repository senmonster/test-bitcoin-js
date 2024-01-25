export type Operation = "init" | "create" | "modify" | "revoke";
export type Encryption = "0" | "1" | "2";
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

const toHexString = (s: string) => {
	return Buffer.from(s).toString("hex");
};

export function buildDataOutput({
	publicKey,
	operation,
	path,
	encryption = "0",
	version = "1.0.0",
	body,
	dataType = "application/json",

	encoding = "UTF-8",
}: {
	publicKey: string;
	operation: Operation;
	path?: string;
	encryption?: "0" | "1" | "2";
	version?: string;
	body?: unknown;
	dataType?: string;
	encoding?: string;
}) {
	const leafScriptAsmArray = [
		publicKey,
		"OP_CHECKSIG",
		"OP_FALSE",
		"OP_IF",
		toHexString("metaid"),
		toHexString(operation),
	];
	if (operation !== "init") {
		leafScriptAsmArray.push(toHexString(path!));
		leafScriptAsmArray.push(toHexString(encryption));
		leafScriptAsmArray.push(toHexString(version));
		leafScriptAsmArray.push(toHexString(dataType));
		leafScriptAsmArray.push(toHexString(JSON.stringify(body!)));
	}
	leafScriptAsmArray.push("OP_ENDIF");
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
	return leafScriptAsmArray.join(" ");
}
