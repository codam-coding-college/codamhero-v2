import Fast42 from '@codam/fast42';
import { prisma, syncDataCB, CAMPUS_ID } from './base';

import { CURSUS_IDS } from './cursus';

export const syncProjectsUsers = async function(api: Fast42, syncDate: Date): Promise<void> {
	// Fetch the last synchronization date from the database
	const syncKind = await prisma.synchronization.findFirst({
		where: {
			kind: 'projects_users',
		},
	});

	await syncDataCB(api, syncDate, syncKind?.last_synced_at, `/projects_users`, {
		'filter[campus]': `${CAMPUS_ID}`,
		'filter[cursus]': CURSUS_IDS.join(','),
	}, async (projectsUsers) => {
		for (const projectUser of projectsUsers) {
			console.debug(`Syncing a project_user (${projectUser.user.login}'s ${projectUser.project.name} - https://projects.intra.42.fr/${projectUser.project.slug}/${projectUser.user.login} - ${projectUser.created_at})...`);

			try {
				await prisma.projectUser.upsert({
					where: {
						id: projectUser.id,
					},
					update: {
						final_mark: projectUser.final_mark ? projectUser.final_mark : null,
						status: projectUser.status,
						validated: projectUser["validated?"] ? projectUser["validated?"] : false,
						current_team_id: projectUser.current_team_id ? projectUser.current_team_id : null,
						updated_at: new Date(projectUser.updated_at),
						marked_at: projectUser.marked_at ? new Date(projectUser.marked_at) : null,
					},
					create: {
						id: projectUser.id,
						final_mark: projectUser.final_mark ? projectUser.final_mark : null,
						status: projectUser.status,
						validated: projectUser["validated?"] ? projectUser["validated?"] : false,
						current_team_id: projectUser.current_team_id ? projectUser.current_team_id : null,
						created_at: new Date(projectUser.created_at),
						updated_at: new Date(projectUser.updated_at),
						marked_at: projectUser.marked_at ? new Date(projectUser.marked_at) : null,
						user: {
							connect: {
								id: projectUser.user.id,
							},
						},
						project: {
							connect: {
								id: projectUser.project.id,
							},
						},
					}
				});
			}
			catch (err) {
				console.error(`Error syncing project_user ${projectUser.user.login}'s ${projectUser.project.name}: ${err}`);
			}
		}
	});


	// Mark synchronization as complete by updating the last_synced_at field
	await prisma.synchronization.upsert({
		where: {
			kind: 'projects_users',
		},
		update: {
			last_synced_at: syncDate,
		},
		create: {
			kind: 'projects_users',
			first_synced_at: syncDate,
			last_synced_at: syncDate,
		},
	});
};
