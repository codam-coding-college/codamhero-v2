import { Express } from 'express';
import nunjucks from 'nunjucks';
import { CursusUser, ProjectUser } from '@prisma/client';
import { PISCINE_CURSUS_IDS } from '../intra/cursus';
import { isPiscineDropout } from '../utils';

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

	// Add formatting to remove the prefix "C Piscine" from project names
	nunjucksEnv.addFilter('removePiscinePrefix', (name: string) => {
		return name.replace(/^C Piscine /, '');
	});

	// Add formatting for status field of a projectuser
	nunjucksEnv.addFilter('formatProjectStatus', (projectUser: ProjectUser) => {
		if (projectUser.marked_at) {
			return (projectUser.final_mark! > 0 ? projectUser.final_mark!.toString() : '0');
		}
		switch (projectUser.status) {
			case 'in_progress':
			case 'waiting_for_correction':
			case 'searching_a_group':
			case 'creating_group':
			case 'waiting_to_start':
				return '...';
			case 'not_started':
				return ' '; // &nbsp;
			case 'finished':
				return 'finished'; // should never happen, the mark should be set
			default:
				return projectUser.status;
		}
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
			// Special piscine handling
			if (PISCINE_CURSUS_IDS.includes(cursusUser.cursus_id)) {
				return (isPiscineDropout(cursusUser) ? 'dropout' : '');
			}
			return 'dropout';
		}
		return '';
	});
};
