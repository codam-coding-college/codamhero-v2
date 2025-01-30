import express from 'express';
import { Request, Response, NextFunction } from "express";
import { CustomSessionData } from "./session";
import { IntraUser } from '../intra/oauth';
import { hasPiscineHistoryAccess } from '../utils';


const checkIfAuthenticated = function(req: Request, res: Response, next: NextFunction) {
	if (req.path.startsWith('/login') || req.path.startsWith('/logout') || res.statusCode === 503) {
		return next();
	}
	if (req.isAuthenticated()) {
		return next();
	}
	// Only save the path for return-to if we are not requesting a static resource
	if (!req.path.match(/^.*\.[^\\]+$/)) {
		// Store the path the user was trying to access
		(req.session as CustomSessionData).returnTo = req.originalUrl;
		return res.redirect('/login');
	}
};

export const checkIfStudentOrStaff = async function(req: Request, res: Response, next: NextFunction) {
	if (!req.user) {
		console.warn(`User is not authenticated, denying access to ${req.path}.`);
		res.status(401);
		return res.send('Unauthorized');
	}
	if ((req.user as IntraUser)?.isStudentOrStaff === true) {
		return next();
	}
	else {
		console.warn(`User ${(req.user as IntraUser)?.id} is not a student with an active 42cursus or staff member, denying access to ${req.path}.`);
		res.status(403);
		return res.send('Forbidden');
	}
};

export const checkIfCatOrStaff = async function(req: Request, res: Response, next: NextFunction) {
	// Warning: should be used together with checkIfStudentOrStaff
	if ((req.user as IntraUser)?.isCatOrStaff === true) {
		return next();
	}
	else {
		console.warn(`User ${(req.user as IntraUser)?.id} is not a C.A.T. (piscine assistant) or staff member, denying access to ${req.path}.`);
		res.status(403);
		return res.send('Forbidden');
	}
};

export const checkIfPiscineHistoryAccess = async function(req: Request, res: Response, next: NextFunction) {
	const year = parseInt(req.params.year);
	if (hasPiscineHistoryAccess(req.user as IntraUser, year)) {
		return next();
	}
	console.warn(`User ${(req.user as IntraUser)?.id} is trying to access a piscine overview for ${year} (which is in the past), denying access to ${req.path}.`);
	res.status(403);
	return res.send('Forbidden');
};

const expressErrorHandler = function(err: any, req: Request, res: Response, next: NextFunction) {
	console.error(err);
	res.status(500);
	return res.send('Internal server error');
};

const includeUser = function(req: Request, res: Response, next: NextFunction) {
	if (req.isAuthenticated()) {
		res.locals.user = req.user;
	}
	next();
};

export const setupExpressMiddleware = function(app: any) {
	app.use(express.static('static'));
	app.use(express.static('intra')); // synced content from Intra, like user pictures
	app.use(checkIfAuthenticated);
	app.use(includeUser);
	app.use(expressErrorHandler); // should remain last
};
