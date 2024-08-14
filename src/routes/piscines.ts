import { Express } from 'express';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import { formatDate, getAllPiscines, getLatestPiscine, numberToMonth, projectStatusToString } from '../utils';
import { checkIfStudentOrStaff } from '../handlers/middleware';
import { getPiscineData } from '../handlers/piscine';

export const setupPiscinesRoutes = function(app: Express, prisma: PrismaClient): void {
	app.get('/piscines', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		// Redirect to latest year and month defined in the database
		const latest = await getLatestPiscine(prisma);
		if (latest) {
			return res.redirect(`/piscines/${latest.year_num}/${latest.month_num}`);
		}
		else {
			// No pisciners found, return 404
			res.status(404);
			return;
		}
	});

	app.get('/piscines/:year/:month', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		// Parse parameters
		const year = parseInt(req.params.year);
		const month = parseInt(req.params.month);

		// Find all possible piscines from the database
		const piscines = await getAllPiscines(prisma);

		const { users, logtimes, dropouts, projects } = await getPiscineData(year, month, prisma);

		return res.render('piscines.njk', { piscines, projects, users, logtimes, dropouts, year, month, subtitle: `${year} ${numberToMonth(month)}` });
	});

	app.get('/piscines/:year/:month/csv', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		// Parse parameters
		const year = parseInt(req.params.year);
		const month = parseInt(req.params.month);

		const { users, logtimes, dropouts, projects } = await getPiscineData(year, month, prisma);

		const now = new Date();
		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', `attachment; filename="piscine-${year}-${month}-export-${formatDate(now).replace(' ', '-')}.csv"`);

		const headers = [
			'login',
			'dropout',
			'last_login_at',
			'logtime_week_one',
			'logtime_week_two',
			'logtime_week_three',
			'logtime_week_four',
			'logtime_total',
			'level',
		];

		// Loop over all projects and add their slugs to the headers
		for (const project of projects) {
			headers.push(project.slug.replace(/\,\-_\s/g, ''));
		}

		res.write(headers.join(',') + '\n');

		for (const user of users) {
			const logtime = logtimes[user.login];
			const dropout = dropouts[user.login] ? 'yes' : 'no';

			const row = [
				user.login,
				dropout,
				formatDate(user.locations[0]?.begin_at),
				logtime.weekOne / 60 / 60, // Convert seconds to hours
				logtime.weekTwo / 60 / 60,
				logtime.weekThree / 60 / 60,
				logtime.weekFour / 60 / 60,
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
