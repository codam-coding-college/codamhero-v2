import Fast42 from '@codam/fast42';
import { syncData } from './base';
import { prisma } from "../handlers/db";
import { CURSUS_IDS } from './cursus';

export const C_PISCINE_PROJECTS_ORDER = [1255, 1256, 1257, 1258, 1259, 1260, 1261, 1262, 1263, 1270, 1264, 1265, 1266, 1267, 1268, 1271, 1308, 1310, 1309, 1305, 1301, 1302, 1303, 1304]; // Cursus ID 9
export const DEPR_PISCINE_C_PROJECTS_ORDER = [154, 155, 156, 157, 158, 159, 160, 161, 162, 167, 163, 164, 165, 166, 168, 169, 170, 171, 172, 173, 404, 405, 406, 407]; // Cursus ID 4
export const DISCO_PISCINE_AI_INTER_PROJECTS_ORDER = [2601, 2602, 2603, 2604, 2605]; // Cursus ID 77
export const DISCO_PISCINE_AI_FUNDA_PROJECTS_ORDER = [2608, 2609, 2610, 2611]; // Cursus ID 79
export const DISCO_PISCINE_CORE_PYTHON_PROJECTS_ORDER = [2612, 2613, 2614, 2615, 2616, 2617, 2618, 2619, 2620, 2621]; // Cursus ID 80
export const DISCO_PISCINE_WEB_PRGM_ESS_PROJECTS_ORDER = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034]; // Cursus ID 3
export const DISCO_PISCINE_DEPR_PYTHON_PROJECTS_ORDER = []; // Not implemented, cursus ID 69
export const COMMON_CORE_PROJECTS_ORDER = [
	1314, // Libft
	1327, // Get_Next_Line
	1316, // ft_printf
	2687, // push_swap (42Next)
		1994, // OLD_CORE Born2beroot
	2708, // Exam Rank 02 (42Next)
		1320, // OLD_CORE Exam Rank 02
	2686, // Born2beroot (42Next)
		1471, // OLD_CORE push_swap
		1476, // OLD_CORE fract-ol
		2008, // OLD_CORE FdF
		2009, // OLD_CORE so_long
		2005, // OLD_CORE minitalk
		2004, // OLD_CORE pipex
	2690, // Python Module 00
	2691, // Python Module 01
	2692, // Python Module 02
	2693, // Python Module 03
	2694, // Python Module 04
	2695, // Python Module 05
	2696, // Python Module 06
	2697, // Python Module 07
	2698, // Python Module 08
	2707, // Python Module 09
	2699, // Python Module 10
	2688, // A-Maze-Ing
	2709, // Exam Rank 03 (42Next)
		1321, // OLD_CORE Exam Rank 03
		1334, // OLD_CORE Philosophers
		1331, // OLD_CORE minishell
	2704, // Codexion
	2705, // Fly-in
	2689, // Call Me Maybe
	2710, // Exam Rank 04 (42Next)
		1322, // OLD_CORE Exam Rank 04
	2007, // NetPractice
	1318, // OLD_OLD_CORE netwhat
		1326, // OLD_CORE cub3d
		1315, // OLD_CORE miniRT
		1338, // OLD_CORE CPP Module 00
		1339, // OLD_CORE CPP Module 01
		1340, // OLD_CORE CPP Module 02
		1341, // OLD_CORE CPP Module 03
		1342, // OLD_CORE CPP Module 04
	2706, // Pac-Man
	2700, // RAG Against The Machine
	2711, // Exam Rank 05 (42Next)
		1323, // OLD_CORE Exam Rank 05
		1343, // OLD_CORE CPP Module 05
		1344, // OLD_CORE CPP Module 06
		1345, // OLD_CORE CPP Module 07
		1346, // OLD_CORE CPP Module 08
		2309, // OLD_CORE CPP Module 09
		1335, // OLD_OLD_CORE ft_containers
	1983, // Inception
		1336, // OLD_CORE ft_irc
		1332, // OLD_CORE webserv
	2701, // The Answer Protocol
	2703, // Agent Smith
	2702, // tree_nity
	2712, // Exam Rank 06 (42Next)
		1324, // OLD_CORE Exam Rank 06
	2623, // 42_Collaborative_resume
	1337, // ft_transcendence
	1638, // Work Experience I
	1662, // Startup Experience
	1650, // Part Time I
 ];

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
						difficulty: project.difficulty || 0,
						cursus_id: cursusId,
						updated_at: new Date(project.updated_at),
					},
					create: {
						id: project.id,
						name: project.name,
						slug: project.slug,
						description: project.description ? project.description : '',
						exam: project.exam,
						difficulty: project.difficulty || 0,
						cursus_id: cursusId,
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
