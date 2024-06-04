import { PrismaClient } from "@prisma/client";
import Fast42 from "@codam/fast42";

import { syncUsers } from "./users";
import { syncCursus } from "./cursus";
import { syncProjects } from "./projects";

export const CAMPUS_ID: number = parseInt(process.env.INTRA_CAMPUS_ID!);
export const prisma = new PrismaClient();

/**
 * Fetch all items from all pages of a Fast42 API endpoint.
 * @usage const codamStudents = await fetchMultiple42ApiPages(api, '/v2/campus/14/users');
 * @param api A Fast42 instance
 * @param path The API path to fetch
 * @param params Optional query parameters for the API request
 * @returns A promise that resolves to an array containing all items from all pages of the API responses
 */
export const fetchMultiple42ApiPages = async function(api: Fast42, path: string, params: { [key: string]: string } = {}): Promise<any[]> {
	return new Promise(async (resolve, reject) => {
		try {
			const pages = await api.getAllPages(path, params);

			let i = 0;
			const pageItems = await Promise.all(pages.map(async (page) => {
				console.debug(`Fetching page ${++i} of ${pages.length}...`);
				const p = await page;
				if (p.status == 429) {
					throw new Error('Intra API rate limit exceeded');
				}
				if (p.ok) {
					const data = await p.json();
					return data;
				}
				else {
					throw new Error(`Intra API error: ${p.status} ${p.statusText} on ${p.url}`);
				}
			}));
			return resolve(pageItems.flat());
		}
		catch (err) {
			return reject(err);
		}
	});
};

export const syncData = async function(api: Fast42, syncDate: Date, lastSyncDate: Date | undefined, path: string, params: any): Promise<any[]> {
	if (lastSyncDate !== undefined) {
		params['range[updated_at]'] = `${lastSyncDate.toISOString()},${syncDate.toISOString()}`;
		console.log(`Fetching data from Intra API updated on path ${path} since ${lastSyncDate.toISOString()}...`);
	}
	else {
		console.log(`Fetching all data from Intra API on path ${path}...`);
	}

	return await fetchMultiple42ApiPages(api, path, params);
};

export const syncWithIntra = async function(api: Fast42): Promise<void> {
	const now = new Date();

	console.info(`Starting Intra synchronization at ${now.toISOString()}...`);

	await syncUsers(api, now);
	await syncCursus(api, now);
	await syncProjects(api, now);

	console.info(`Intra synchronization completed at ${new Date().toISOString()}.`);
};
