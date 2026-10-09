import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
	const { env } = getCloudflareContext();
	return env.DB;
}
