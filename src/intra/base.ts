import { PrismaClient } from "@prisma/client";
import Fast42 from "@codam/fast42";

import { syncUsers } from "./users";
import { syncCursus } from "./cursus";
import { syncProjects } from "./projects";
import { syncProjectsUsers } from "./projects_users";

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
				const p = await page;
				if (p.status == 429) {
					throw new Error('Intra API rate limit exceeded');
				}
				if (p.ok) {
					const data = await p.json();
					console.debug(`Fetched page ${++i} of ${pages.length} on ${path}...`);
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

/**
 * Fetch all items from all pages of a Fast42 API endpoint, with a callback function for each page fetched.
 * Useful for larger datasets that may not fit in memory.
 * @usage const codamStudents = await fetchMultiple42ApiPages(api, '/v2/campus/14/users');
 * @param api A Fast42 instance
 * @param path The API path to fetch
 * @param params Optional query parameters for the API request
 * @param callback A callback function to call for each page fetched
 * @returns A promise that resolves to an array containing all items from all pages of the API responses
 */
export const fetchMultiple42ApiPagesCallback = async function(api: Fast42, path: string, params: { [key: string]: string } = {}, callback: (data: any) => void): Promise<void> {
	return new Promise(async (resolve, reject) => {
		try {
			const pages = await api.getAllPages(path, params);

			let i = 0;
			for (const page of pages) {
				const p = await page;
				if (p.status == 429) {
					throw new Error('Intra API rate limit exceeded');
				}
				if (p.ok) {
					const data = await p.json();
					console.debug(`Fetched page ${++i} of ${pages.length} on ${path}...`);
					callback(data);
				}
				else {
					throw new Error(`Intra API error: ${p.status} ${p.statusText} on ${p.url}`);
				}
			}
			return resolve();
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

export const syncDataCB = async function(api: Fast42, syncDate: Date, lastSyncDate: Date | undefined, path: string, params: any, callback: (data: any) => void): Promise<void> {
	if (lastSyncDate !== undefined) {
		params['range[updated_at]'] = `${lastSyncDate.toISOString()},${syncDate.toISOString()}`;
		console.log(`Fetching data from Intra API updated on path ${path} since ${lastSyncDate.toISOString()}...`);
	}
	else {
		console.log(`Fetching all data from Intra API on path ${path}...`);
	}

	await fetchMultiple42ApiPagesCallback(api, path, params, callback);
}

export const syncWithIntra = async function(api: Fast42): Promise<void> {
	const now = new Date();

	console.info(`Starting Intra synchronization at ${now.toISOString()}...`);

	await syncUsers(api, now);
	await syncCursus(api, now);
	await syncProjects(api, now);
	await syncProjectsUsers(api, now);

	console.info(`Intra synchronization completed at ${new Date().toISOString()}.`);
};
