import express from 'express';
import { Request, Response, NextFunction } from "express";
import { IntraUser } from "../intra/oauth";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const checkIfAuthenticated = function(req: Request, res: Response, next: NextFunction) {
	if (req.path.startsWith('/login') || req.path.startsWith('/logout') || res.statusCode === 503) {
		return next();
	}
	if (req.isAuthenticated()) {
		return next();
	}
	return res.redirect('/login');
};

export const checkIfStudentOrStaff = async function(req: Request, res: Response, next: NextFunction) {
	// If the user account is of kind "admin", let them continue
	if ((req.user as IntraUser)?.kind === 'admin') {
		return next();
	}
	// If the student has an ongoing 42cursus, let them continue
	const userId = (req.user as IntraUser)?.id;
	const cursusUser = await prisma.cursusUser.findFirst({
		where: {
			user_id: userId,
			cursus_id: 21,
			end_at: null,
		},
	});
	if (cursusUser) {
		return next();
	}
	else {
		console.warn(`User ${userId} is not a student with an active 42cursus or staff member, denying access to ${req.path}.`);
		res.status(403);
		return res.send('Forbidden');
	}
};

const expressErrorHandler = function(err: any, req: Request, res: Response, next: NextFunction) {
	if (err === 'User not found') {
		return res.redirect('/login/failed');
	}
	else {
		console.error(err);
		res.status(500);
		return res.send('Internal server error');

	}
};

export const setupExpressMiddleware = function(app: any) {
	app.use(express.static('static'));
	app.use(express.static('intra')); // synced content from Intra, like user pictures
	app.use(checkIfAuthenticated);
	app.use(expressErrorHandler); // should remain last
};
