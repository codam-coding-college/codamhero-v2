import Fast42 from '@codam/fast42';
import { prisma, syncData } from './base';

import { CURSUS_IDS } from './cursus';

export const C_PISCINE_PROJECTS_ORDER = [1255, 1256, 1257, 1258, 1259, 1260, 1261, 1262, 1263, 1270, 1264, 1265, 1266, 1267, 1268, 1271, 1308, 1310, 1309, 1305, 1301, 1302, 1303, 1304];

export const syncProjects = async function(api: Fast42, syncDate: Date): Promise<void> {
	// Fetch the last synchronization date from the database
	const syncKind = await prisma.synchronization.findFirst({
		where: {
			kind: 'projects',
		},
	});

	// Fetch all projects from the API for each cursus updated since the last synchronization
	for (const cursusId of CURSUS_IDS) {
		const projects = await syncData(api, syncDate, syncKind?.last_synced_at, `/cursus/${cursusId}/projects`, {});

		// Insert or update each project in the database
		let i = 0;
		const total = projects.length;
		for (const project of projects) {
			console.debug(`Syncing project ${++i}/${total} for cursus ${cursusId} (${project.name})...`);

			try {
				await prisma.project.upsert({
					where: {
						id: project.id,
					},
					update: {
						name: project.name,
						slug: project.slug,
						description: project.description ? project.description : '',
						exam: project.exam,
						updated_at: new Date(project.updated_at),
					},
					create: {
						id: project.id,
						name: project.name,
						slug: project.slug,
						description: project.description ? project.description : '',
						exam: project.exam,
						created_at: new Date(project.created_at),
						updated_at: new Date(project.updated_at),
					},
				});
			}
			catch (err) {
				console.error(`Error syncing project ${project.name}: ${err}`);
			}
		}
	}

	// Mark synchronization as complete by updating the last_synced_at field
	await prisma.synchronization.upsert({
		where: {
			kind: 'projects',
		},
		update: {
			last_synced_at: syncDate,
		},
		create: {
			kind: 'projects',
			first_synced_at: syncDate,
			last_synced_at: syncDate,
		},
	});
};
