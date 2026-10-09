const PBKDF2_PREFIX = "pbkdf2_sha256";
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_BITS = 256;

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	const copy = new ArrayBuffer(bytes.byteLength);
	const view = new Uint8Array(copy);
	view.set(bytes);
	return view;
}

function timingSafeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) {
		return false;
	}

	let mismatch = 0;
	for (let index = 0; index < left.length; index += 1) {
		mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return mismatch === 0;
}

async function deriveHash(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey("raw", copyBytes(new TextEncoder().encode(password)), "PBKDF2", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt: copyBytes(salt),
			iterations,
		},
		key,
		PBKDF2_BITS,
	);
	return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await deriveHash(password, salt, PBKDF2_ITERATIONS);
	return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
	const [prefix, iterationText, saltText, hashText] = passwordHash.split("$");
	const iterations = Number(iterationText);
	if (prefix !== PBKDF2_PREFIX || !Number.isInteger(iterations) || iterations < 1 || !saltText || !hashText) {
		return false;
	}

	try {
		const derived = await deriveHash(password, base64ToBytes(saltText), iterations);
		return timingSafeEqual(bytesToBase64(derived), hashText);
	} catch {
		return false;
	}
}
