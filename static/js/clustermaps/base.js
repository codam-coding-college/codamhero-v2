const USER_IMAGE_SIZE = 60;

function userHover(event) {
	// Link the user to the "use" element to bring it to the front
	const userContainer = event.target.closest('.user-container');
	if (!userContainer || !userContainer.id) {
		console.log("No userContainer found or no id found on userContainer, cannot highlight user");
		return;
	}
	const svg = event.target.closest('svg');
	if (!svg) {
		// For some reason it gets here every time the use element was linked to the correct user,
		// which is why the following console log is commented out
		// console.log("No svg found for hover element, cannot highlight user");
		return;
	}
	userFocus(svg, userContainer);
}

function userFocus(svg, userContainer) {
	const use = svg.querySelector(`use#hoverfront`);
	if (use === null) {
		console.warn("No use element found in svg, cannot highlight user");
		return;
	}

	use.setAttribute("xlink:href", `#${userContainer.id}`);
	userContainer.classList.add('hover');
	use.addEventListener('mouseleave', userMouseOut, {once: true});
}

function userMouseOut(event) {
	const svg = event.target.closest('svg');
	const user = svg.querySelector(event.target.getAttribute('xlink:href'));
	if (user.classList.contains('hover')) {
		user.classList.remove('hover');
	}
	event.target.setAttribute('xlink:href', '');

	// Remove tooltip
	const tooltip = document.getElementById('tooltip-user');
	if (tooltip) {
		// tooltip.remove();
	}
}

/**
 * Get the hostname from a location in the expected format. Used to be hostname.codam.nl, is now just hostname.
 * @param {string} host The hostname from the location
 */
function getHostNameWrapper(host) {
	if (host.indexOf('.') > -1) {
		return host.split('.')[0];
	}
	return host;
}

function getSvgContentDocumentForHost(hostname) {
	hostname = getHostNameWrapper(hostname); // Remove .codam.nl from hostname if applicable
	const clustermap = document.querySelector(`.clustermap#${hostname.slice(0, 2)}`);
	if (clustermap === null) {
		return null;
	}
	return clustermap.contentDocument;
}

function getHost(hostname) {
	hostname = getHostNameWrapper(hostname); // Remove .codam.nl from hostname if applicable
	const clustermap = getSvgContentDocumentForHost(hostname);
	if (clustermap === null) {
		return null;
	}
	const host = clustermap.querySelector(`#${hostname}`);
	if (host === null) {
		return null;
	}
	return host;
}

/**
 * Only to be used by the hash change event listener
 * @param {*} hostname
 * @returns
 */
function focusHostHash(hostname) {
	// Remove all existing focus on hosts
	const svgs = document.querySelectorAll('.clustermap');
	for (const svg of svgs) {
		const existingFocus = svg.contentDocument.querySelectorAll('.focus-hash');
		for (const focus of existingFocus) {
			focus.classList.remove('focus-hash');
		}
	}

	// Find the svg the host belongs to
	const svg = getSvgContentDocumentForHost(hostname);
	if (!svg) {
		console.warn(`Focus failed: no SVG found for host ${hostname}`);
		return;
	}
	// Focus on the host
	const host = svg.querySelector(`circle#${hostname}`);
	if (!host) {
		console.warn(`Focus failed: no host found for host ${hostname} in svg`, svg);
		return;
	}
	host.classList.add('focus-hash');
	// Focus on the user if the host is in use
	const user = svg.querySelector(`.user-container[data-host=${hostname}]`);
	if (user) {
		console.log(`Focusing on user ${user.dataset.login}`);
		userFocus(svg, user);
		user.classList.add('focus-hash');
	}
}

function createLocation(location) {
	const host = getHost(location.host);
	if (!host) {
		console.warn(`No host found in clustermap for location ${location.host}`);
		return;
	}

	host.classList.add('in-use');

	// Create user container
	const userContainer = document.createElementNS('http://www.w3.org/2000/svg', 'a');
	userContainer.classList.add('user-container');
	userContainer.setAttribute('id', `user-${location.user.login}-${getHostNameWrapper(location.host)}`);
	userContainer.setAttribute('href', `https://profile.intra.42.fr/users/${location.user.login}`);
	userContainer.setAttribute('target', '_blank');
	userContainer.setAttribute('data-begin-at', location.begin_at);
	userContainer.setAttribute('data-login', location.user.login);
	userContainer.setAttribute('data-display-name', location.user.display_name);
	userContainer.setAttribute('data-host', getHostNameWrapper(location.host));
	userContainer.addEventListener('mouseenter', userHover);

	// Create overlay with user image and login in svg
	const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
	image.setAttribute('href', location.user.image);
	image.setAttribute('width', `${USER_IMAGE_SIZE}px`);
	image.setAttribute('height', `${USER_IMAGE_SIZE}px`);
	image.setAttribute('x', host.getAttribute('cx') - USER_IMAGE_SIZE / 2);
	image.setAttribute('y', host.getAttribute('cy') - USER_IMAGE_SIZE / 2);
	image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
	image.setAttribute('clip-path', `circle(${USER_IMAGE_SIZE / 2}px)`);
	image.classList.add('user-image');
	userContainer.appendChild(image);

	// Draw a circle around the user's image
	const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
	circle.setAttribute('cx', host.getAttribute('cx'));
	circle.setAttribute('cy', host.getAttribute('cy'));
	circle.setAttribute('r', USER_IMAGE_SIZE / 2);
	circle.classList.add('user-circle', 'in-use');
	userContainer.appendChild(circle);

	// Create tooltip (only shown on hover)
	const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	tooltip.classList.add('user-tooltip');
	userContainer.appendChild(tooltip);

	const tooltipbg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
	tooltipbg.setAttribute('x', host.getAttribute('cx') - USER_IMAGE_SIZE * 0.75);
	tooltipbg.setAttribute('y', parseInt(host.getAttribute('cy')) + USER_IMAGE_SIZE * 0.5);
	tooltipbg.setAttribute('width', USER_IMAGE_SIZE * 1.5);
	tooltipbg.setAttribute('height', 38);
	tooltipbg.classList.add('user-tooltip-bg');
	tooltip.appendChild(tooltipbg);

	// Little arrow pointing up from the tooltip's middle
	const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	arrow.classList.add('user-tooltip-arrow');
	const arrowSize = 8; // pixels
	arrow.setAttribute('d', `M${arrowSize} 0l${arrowSize} ${arrowSize}H0z`);
	arrow.setAttribute('transform', `translate(${host.getAttribute('cx') - arrowSize}, ${parseInt(host.getAttribute('cy')) + USER_IMAGE_SIZE * 0.5 - arrowSize})`);
	tooltip.appendChild(arrow);

	const loginText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
	loginText.textContent = `${location.user.login}`;
	loginText.setAttribute('x', host.getAttribute('cx'));
	loginText.setAttribute('y', parseInt(host.getAttribute('cy')) + USER_IMAGE_SIZE * 0.75);
	loginText.setAttribute('text-anchor', 'middle');
	loginText.classList.add('user-tooltip-text', 'user-tooltip-login');
	tooltip.appendChild(loginText);

	const hostnameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
	hostnameText.textContent = `${location.host}`;
	hostnameText.setAttribute('x', host.getAttribute('cx'));
	hostnameText.setAttribute('y', parseInt(host.getAttribute('cy')) + USER_IMAGE_SIZE * 0.75 + 18);
	hostnameText.setAttribute('text-anchor', 'middle');
	hostnameText.classList.add('user-tooltip-text', 'user-tooltip-hostname');
	tooltip.appendChild(hostnameText);

	const svg = host.closest('svg');
	svg.querySelector("#Users").appendChild(userContainer);
}

function removeLocation(location) {
	const host = getHost(location.host);
	if (!host) {
		console.warn(`No host found in clustermap for location ${location.host}`);
		return;
	}
	host.classList.remove('in-use');

	// Remove the user container
	const svg = host.closest('svg');
	const userContainer = svg.querySelector(`#user-${location.user.login}-${location.host}`);
	if (userContainer) {
		userContainer.remove();
	}
	else {
		console.warn(`No user container found for location ${location.host} ${location.user.login}`);
	}

	// If the element was in focus by the <use> element, remove the focus
	const use = svg.querySelector(`use#hoverfront`);
	if (use && use.getAttribute('xlink:href') === `#user-${location.user.login}-${location.host}`) {
		use.setAttribute('xlink:href', '');
	}
}

function filterUpdatedLocations(oldLocations, newLocations) {
	if (!oldLocations) {
		return {
			"added": newLocations,
			"removed": [],
		};
	}
	const oldIDs = oldLocations.map(location => location.id);
	const newIDs = newLocations.map(location => location.id);
	const added = newLocations.filter(location => !oldIDs.includes(location.id));
	const removed = oldLocations.filter(location => !newIDs.includes(location.id));
	return {
		"added": added,
		"removed": removed,
	};
};

function updateClustermap(data) {
	console.log(data);
	// Update the clustermap with the new locations
	for (const removedLocation of data["removed"]) {
		removeLocation(removedLocation);
	}
	for (const newLocation of data["added"]) {
		createLocation(newLocation);
	}
}

// Check for duplicate ids on the clustermaps
setTimeout(function() {
	const clustermaps = document.querySelectorAll('.clustermap');
	const ids = new Set();
	for (const clustermap of clustermaps) {
		const workstations = clustermap.contentDocument.querySelectorAll('.workstation');
		const hostIDs = Array.from(workstations).map(host => host.id);
		for (const id of hostIDs) {
			if (ids.has(id)) {
				console.warn(`Duplicate hostname found on clustermap: ${id}`);
			}
			ids.add(id);
		}
	}
}, 1000);
