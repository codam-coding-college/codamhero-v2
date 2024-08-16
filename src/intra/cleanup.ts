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
			console.log(`Anonymizing user ${user.login} using cursus_user ${cursusUser.id}...`);
			// Fetch user using cursus_user to circumvent the fact that the Intra API does not return anonymized users
			// when using a regular student API key, even when requesting the user object with the specific user ID.
			// The user data is still intact in the cursus_user object, so we can copy Intra's anonymized name from there.
			const anonymizedData = await fetchSingle42ApiPage(api, `/cursus_users/${cursusUser.id}`, {});
			if (!anonymizedData.user) {
				console.warn(`User ${user.login} has no user data in their cursus_user ${cursusUser.id}, cannot anonymize!`);
				continue;
			}
			await syncUser(anonymizedData.user);
		}
		catch (err) {
			console.error(`Error anonymizing user ${user.login}: ${err}`);
		}
	}
};

export const cleanupDB = async function(api: Fast42): Promise<void> {
	console.info('Cleaning up the database...');
	await cleanupDuplicateProjectUsers();
	await anonymizeUsers(api);
};
