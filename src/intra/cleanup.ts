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
		const anonymizedData = await fetchSingle42ApiPage(api, `/users/${user.id}`);
		console.log(`Anonymizing user ${user.login}...`);
		await syncUser(anonymizedData);
	}
};

export const cleanupDB = async function(api: Fast42): Promise<void> {
	console.info('Cleaning up the database...');
	await cleanupDuplicateProjectUsers();
	await anonymizeUsers(api);
};
