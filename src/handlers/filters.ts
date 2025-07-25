import { Express } from 'express';
import nunjucks from 'nunjucks';
import { CursusUser, ProjectUser } from '@prisma/client';
import { DISCO_PISCINE_CURSUS_IDS, PISCINE_CURSUS_IDS } from '../intra/cursus';
import { isDiscoPiscineDropout, isCPiscineDropout, projectStatusToString, shortenDiscoPiscineCursusName } from '../utils';

export const setupNunjucksFilters = function(app: Express): void {
	const nunjucksEnv = nunjucks.configure('templates', {
		autoescape: true,
		express: app,
	});

	// Add formatting filter for seconds to hh:mm format
	nunjucksEnv.addFilter('formatSeconds', (seconds: number) => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${hours.toString().padStart(2, '0')}h${minutes.toString().padStart(2, '0')}`;
	});

	// Add formatting filter to format a date as "... minutes/hours/days ago"
	nunjucksEnv.addFilter('timeAgo', (date: Date | null) => {
		if (!date) {
			return 'never';
		}

		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		const years = Math.floor(days / 365);

		if (years > 2) {
			return `${years} years ago`;
		}
		else if (days > 2) { // < 3 days we want to see the hours
			return `${days} days ago`;
		}
		else if (hours > 1) {
			return `${hours} hours ago`;
		}
		else if (minutes > 10) { // > 10 because we synchronize every 10 minutes, otherwise we'll show "just now"
			return `${minutes} minutes ago`;
		}
		else {
			return `just now`;
		}
	});

	// Add formatting filter to format a date as a timestamp
	nunjucksEnv.addFilter('timestamp', (date: Date | null) => {
		if (!date) {
			return 0;
		}
		return date.getTime();
	});

	// Add formatting to remove the prefix "C Piscine" from project names
	nunjucksEnv.addFilter('removeCPiscinePrefix', (name: string) => {
		return name.replace(/^C Piscine /, '')
	});

	// Add formatting to remove the prefixes from several Discovery Piscine project names
	nunjucksEnv.addFilter('removeDiscoPiscinePrefix', (name: string) => {
		return name.replace(/^Disco Piscine - /, '').replace(/^Module/, '').replace(/^Cellule/, '').replace(/^disco-ai-/, '').replace(/^Python - /, '');
	});

	// Add formatting to remove the prefix "Discovery Piscine" from cursus names
	nunjucksEnv.addFilter('removeDiscoPiscineCursusPrefix', (name: string) => {
		return shortenDiscoPiscineCursusName(name);
	});

	// Add formatting for status field of a projectuser
	nunjucksEnv.addFilter('formatProjectStatus', (projectUser: ProjectUser) => {
		return projectStatusToString(projectUser);
	});

	// Add formatting to render floats
	nunjucksEnv.addFilter('formatFloat', (num: number) => {
		return num.toFixed(2);
	});

	// Add formatting for dropouts based on cursusUser
	nunjucksEnv.addFilter('markDropout', (cursusUser: CursusUser) => {
		const now = new Date();
		if (!cursusUser) {
			return '';
		}
		if (cursusUser.end_at && cursusUser.end_at < now) {
			// Special C Piscine handling
			if (PISCINE_CURSUS_IDS.includes(cursusUser.cursus_id)) {
				return (isCPiscineDropout(cursusUser) ? 'dropout' : '');
			}
			// Special Discovery Piscine handling
			if (DISCO_PISCINE_CURSUS_IDS.includes(cursusUser.cursus_id)) {
				return (isDiscoPiscineDropout(cursusUser) ? 'dropout' : '');
			}
			return 'dropout';
		}
		return '';
	});

	// Debug function to display raw json data
	nunjucksEnv.addFilter('dump', (data: any) => {
		return JSON.stringify(data, null, 2);
	});
};
