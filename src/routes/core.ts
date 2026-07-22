import { Express } from 'express';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import { Cohort, getAllCohorts, isSingularReqParamInt } from '../utils';
import { checkIfStudentOrStaff } from '../handlers/middleware';
import { getCommonCoreCohortData } from '../handlers/core';

export const setupCommonCoreRoutes = function(app: Express, prisma: PrismaClient): void {
	app.get('/core', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		const cohorts: Cohort[] = await getAllCohorts(prisma);

		const { data: { users, stats, logtimes, dropouts, alumni, projects }, isCached } = await getCommonCoreCohortData(prisma, null);

		res.setHeader('X-Cache', (isCached ? 'HIT' : 'MISS'));
		return res.render('core.njk', { subtitle: 'All cohorts', cohorts, users, stats, logtimes, dropouts, alumni, projects });
	});

	app.get('/core/:year', passport.authenticate('session'), checkIfStudentOrStaff, async (req, res) => {
		if (!isSingularReqParamInt(req.params.year, /^\d{4}$/)) {
			return null;
		}
		const year = parseInt(req.params.year);
		const cohorts: Cohort[] = await getAllCohorts(prisma);

		const { data: { users, stats, logtimes, dropouts, alumni, projects }, isCached } = await getCommonCoreCohortData(prisma, year);

		res.setHeader('X-Cache', (isCached ? 'HIT' : 'MISS'));
		return res.render('core.njk', { subtitle: `${year} cohort`, cohorts, users, year, stats, logtimes, dropouts, alumni, projects });
	});
};
