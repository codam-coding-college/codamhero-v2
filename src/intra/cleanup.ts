import { prisma, fetchSingle42ApiPage } from './base';
import Fast42 from '@codam/fast42';
import { syncUser } from './users';

const cleanupDuplicateProjectUsers = async function(): Promise<void> {
	// Clean up duplicate project_users
	// They can show up when a project_user was deleted and replaced by a completely new one
	// Find all project_users with the same user_id and project_id
	const projectUsers = await prisma.projectUser.findMany({
		select: {
			id: true,
			user_id: true,
			project_id: true,
		},
	});
	// Group them by user_id and project_id
	const projectUsersGrouped = projectUsers.reduce((acc, projectUser) => {
		const key = `${projectUser.user_id}-${projectUser.project_id}`;
		if (!acc[key]) {
			acc[key] = [];
		}
		acc[key].push(projectUser.id);
		return acc;
	}, {} as Record<string, number[]>);
	// Loop over each group and keep only the highest id
	for (const group in projectUsersGrouped) {
		const user_id = group.split('-')[0];
		const project_id = group.split('-')[1];
		const ids = projectUsersGrouped[group];
		if (ids.length > 1) {
			const [keep, ...remove] = ids.sort((a, b) => b - a);
			if (remove.length > 0) {
				console.log(`Removing ${remove.length} duplicate project_users for user ${user_id}'s project ${project_id} - removing ${remove.join(', ')} and keeping ${keep}`);
				await prisma.projectUser.deleteMany({
					where: {
						id: {
							in: remove,
						},
					},
				});
			}
		}
	}
};

const cleanupNonExistentCursusUsers = async function(api: Fast42): Promise<void> {
	// This function makes sure to clean up cursus_users that no longer exist in the API.
	// This can happen when an applicant unsubscribes from a kickoff or a piscine through Apply.
	// Fetch cursus_users from the database, limited with a begin_at within the past year or the future.
	// If cleanup further is needed, manually delete all cursus_users from the database and reseed.
	const cursusUsers = await prisma.cursusUser.findMany({
		select: {
			id: true,
			user_id: true,
			cursus_id: true,
		},
		where: {
			begin_at: {
				gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // within the past year
			},
		},
	});

	// Fetch these cursus_users again from the API, by AMOUNT_PER_PAGE per page using filters
	const AMOUNT_PER_PAGE = 30;
	const pagesToFetch = Math.ceil(cursusUsers.length / AMOUNT_PER_PAGE);
	console.log(`Found ${cursusUsers.length} cursus_users in the database. Cleaning up non-existent ones (will take ${pagesToFetch} API calls)...`);
	for (let i = 0; i < cursusUsers.length; i += AMOUNT_PER_PAGE) {
		const page = cursusUsers.slice(i, i + AMOUNT_PER_PAGE);
		const ids = page.map((cursusUser) => cursusUser.id);
		try {
			console.log(`Cursus_user cleanup: Fetching page ${i / AMOUNT_PER_PAGE + 1} of ${pagesToFetch}...`);
			const cursusUsersData = await fetchSingle42ApiPage(api, '/cursus_users', {
				'filter[id]': ids.join(','),
				'page[size]': AMOUNT_PER_PAGE.toString(),
				'page[number]': '1',
			});
			if (!cursusUsersData || cursusUsersData.length === 0) {
				console.warn(`No cursus_users found at all for ids ${ids.join(', ')}, this is possibly a bug, skipping deletion!`);
				continue;
			}
			const fetchedIds = cursusUsersData.map((cursusUser: { id: number }) => cursusUser.id);
			// Find the ids that are not in the fetched data
			const nonExistentIds = ids.filter((id) => !fetchedIds.includes(id));
			if (nonExistentIds.length > 0) {
				console.log(`Removing ${nonExistentIds.length} non-existent local cursus_users with ids: ${nonExistentIds.join(', ')}`);
				await prisma.cursusUser.deleteMany({
					where: {
						id: {
							in: nonExistentIds,
						},
					},
				});
			}
		}
		catch (err) {
			console.error(`Error fetching cursus_users for ids ${ids.join(', ')}: ${err}`);
			continue;
		}
	}
	console.log('Finished cleaning up non-existent cursus_users.');
};

const anonymizeUsers = async function(api: Fast42): Promise<void> {
	// Fetch all users where the anonymize_date is in the past, not null and the login does not yet start with 3b3
	const users = await prisma.user.findMany({
		where: {
			anonymize_date: {
				lt: new Date(),
				not: null,
				gt: new Date('1970-01-01'), // timestamp > 0
			},
			login: {
				not: {
					startsWith: '3b3',
				},
			},
		},
	});

	// Request the anonymized data from the API and overwrite the local data
	for (const user of users) {
		try {
			const cursusUser = await prisma.cursusUser.findFirst({
				where: {
					user_id: user.id,
				},
			});
			if (!cursusUser) {
				console.warn(`User ${user.login} has no cursus_users, cannot anonymize!`);
				continue;
			}
			console.log(`Anonymizing user ${user.id} using cursus_user ${cursusUser.id}...`);
			// Fetch user using cursus_user to circumvent the fact that the Intra API does not return anonymized users
			// when using a regular student API key, even when requesting the user object with the specific user ID.
			// The user data is still intact in the cursus_user object, so we can copy Intra's anonymized name from there.
			const anonymizedData = await fetchSingle42ApiPage(api, `/cursus_users/${cursusUser.id}`, {});
			if (!anonymizedData.user) {
				console.warn(`User ${user.id} has no user data in their cursus_user ${cursusUser.id}, cannot anonymize!`);
				continue;
			}
			await syncUser(anonymizedData.user);
		}
		catch (err) {
			console.error(`Error anonymizing user ${user.id}: ${err}`);
		}
	}
};

export const cleanupDB = async function(api: Fast42): Promise<void> {
	console.info('Cleaning up the database...');
	await cleanupDuplicateProjectUsers();
	// await cleanupNonExistentCursusUsers(api); /* Disabled for now, as this is already included in the syncCursus function */
	await anonymizeUsers(api);
};
