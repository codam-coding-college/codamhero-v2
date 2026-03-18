import { Express } from 'express';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import { formatDate, getAllDiscoPiscines, getLatestDiscoPiscine, hasLimitedPiscineHistoryAccess, projectStatusToString, shortenDiscoPiscineCursusName, isSingularReqParamInt } from '../utils';
import { checkIfStudentOrStaff, checkIfCatOrStaff, checkIfPiscineHistoryAccess } from '../handlers/middleware';
import { getDiscoPiscineData } from '../handlers/disco';
import { IntraUser } from '../intra/oauth';

const parseDiscoPiscineParams = function(req: any): { year: number, week: number, cursus_id: number } | null {
	if (!isSingularReqParamInt(req.params.year, /^\d{4}$/) ||
		!isSingularReqParamInt(req.params.week) ||
		!isSingularReqParamInt(req.params.cursus_id)) {
		return null;
	}
	const year = parseInt(req.params.year);
	const week = parseInt(req.params.week);
	const cursus_id = parseInt(req.params.cursus_id);
	return { year, week, cursus_id };
};

export const setupDiscoPiscineRoutes = function(app: Express, prisma: PrismaClient): void {
	app.get('/disco', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		// Redirect to latest year and week defined in the database
		const latest = await getLatestDiscoPiscine(prisma);
		if (latest) {
			return res.redirect(`/disco/${latest.year_num}/${latest.week_num}/${latest.cursus.id}`);
		}
		else {
			// No pisciners found, return 404
			return res.status(404).send('No discovery piscines found');
		}
	});

	app.get('/disco/:year/:week', passport.authenticate('session'), async (req, res) => {
		if (!isSingularReqParamInt(req.params.year, /^\d{4}$/) || !isSingularReqParamInt(req.params.week)) {
			return res.status(400).send('Invalid parameters');
		}
		// No cursus_id provided, redirect to the first discovery piscine found in corresponding year and week
		const year = parseInt(req.params.year);
		const week = parseInt(req.params.week);
		const discopiscines = await getAllDiscoPiscines(prisma);
		const discopiscine = discopiscines.find(p => p.year_num === year && p.week_num === week);
		if (!discopiscine) {
			console.log(`No discovery piscine found for year ${year} and week ${week}`);
			return res.status(404).send('No discovery piscines found');
		}
		return res.redirect(`/disco/${year}/${week}/${discopiscine.cursus.id}`);
	});

	app.get('/disco/:year/:week/:cursus_id', passport.authenticate('session'), checkIfStudentOrStaff, checkIfCatOrStaff, checkIfPiscineHistoryAccess, async (req, res) => {
		// Parse parameters
		const params = parseDiscoPiscineParams(req);
		if (!params) {
			return res.status(400).send('Invalid parameters');
		}

		// Find all possible disco piscines from the database (if not staff, limit to the current year)
		const discopiscines = await getAllDiscoPiscines(prisma, hasLimitedPiscineHistoryAccess(req.user as IntraUser));

		// Get the discovery piscine based on the year and week
		const discopiscine = discopiscines.find(p => p.year_num === params.year && p.week_num === params.week && p.cursus.id === params.cursus_id);
		if (!discopiscine) {
			console.log(`No discovery piscine found for year ${params.year}, week ${params.week} and cursus_id ${params.cursus_id}`);
			res.status(404);
			return;
		}

		const piscineData = await getDiscoPiscineData(prisma, params.year, params.week, params.cursus_id);
		if (!piscineData) {
			console.log(`No discovery piscine found for year ${params.year}, week ${params.week} and cursus_id ${params.cursus_id}`);
			res.status(404);
			return;
		}

		const { users, stats, logtimes, dropouts, potentialDropouts, activeStudents, projects } = piscineData;
		return res.render('disco.njk', { discopiscines, projects, users, stats, logtimes, dropouts, potentialDropouts, activeStudents, year: params.year, week: params.week, cursus_id: params.cursus_id, subtitle: `${params.year} week ${params.week}: ${shortenDiscoPiscineCursusName(discopiscine.cursus.name)})` });
	});

	app.get('/disco/:year/:week/:cursus_id/csv', passport.authenticate('session'), checkIfStudentOrStaff, checkIfCatOrStaff, checkIfPiscineHistoryAccess, async (req, res) => {
			// Parse parameters
			const params = parseDiscoPiscineParams(req);
			if (!params) {
				return res.status(400).send('Invalid parameters');
			}

			const piscineData = await getDiscoPiscineData(prisma, params.year, params.week, params.cursus_id);
			if (!piscineData) {
				console.log(`No discovery piscine found for year ${params.year}, week ${params.week} and cursus_id ${params.cursus_id}`);
				res.status(404);
				return;
			}

			const now = new Date();
			res.setHeader('Content-Type', 'text/csv');
			res.setHeader('Content-Disposition', `attachment; filename="disco-piscine-${params.year}-${params.week}-${params.cursus_id}-export-${formatDate(now).replace(' ', '-')}.csv"`);

			const headers = [
				'login',
				'active_student',
				'dropout',
				'potential_dropout',
				'last_login_at',
				'logtime_day_one',
				'logtime_day_two',
				'logtime_day_three',
				'logtime_day_four',
				'logtime_day_five',
				'logtime_total',
				'level',
			];

			// Loop over all projects and add their slugs to the headers
			for (const project of piscineData.projects) {
				headers.push(project.slug.replace(/\,\-_\s/g, ''));
			}

			res.write(headers.join(',') + '\n');

			for (const user of piscineData.users) {
				const logtime = piscineData.logtimes[user.login];
				const dropout = piscineData.dropouts[user.login] ? 'yes' : 'no';
				const potentialDropout = piscineData.potentialDropouts[user.login] ? 'yes' : 'no';
				const activeStudent = piscineData.activeStudents[user.login] ? 'yes' : 'no';

				const row = [
					user.login,
					activeStudent,
					dropout,
					potentialDropout,
					formatDate(user.locations[0]?.begin_at),
					logtime.dayOne / 60 / 60, // Convert seconds to hours
					logtime.dayTwo / 60 / 60,
					logtime.dayThree / 60 / 60,
					logtime.dayFour / 60 / 60,
					logtime.dayFive / 60 / 60,
					logtime.total / 60 / 60,
					user.cursus_users[0]?.level || 0,
				];

				// Add every user's project to the row
				for (const project_user of user.project_users) {
					row.push(projectStatusToString(project_user, false));
				}

				res.write(row.join(',') + '\n');
			}
			res.end();
		});
};
