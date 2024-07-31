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

function getHost(location) {
	const clustermap = document.querySelector(`.clustermap#${location.host.slice(0, 2)}`);
	if (clustermap === null) {
		return null;
	}
	const host = clustermap.contentDocument.querySelector(`#${location.host}`);
	if (host === null) {
		return null;
	}
	return host;
}

function createLocation(location) {
	const host = getHost(location);
	if (!host) {
		// console.warn(`No host found in clustermap for location ${location.host}`);
		return;
	}

	host.classList.add('in-use');

	// Create user container
	const userContainer = document.createElementNS('http://www.w3.org/2000/svg', 'a');
	userContainer.classList.add('user-container');
	userContainer.setAttribute('id', `user-${location.user.login}-${location.host}`);
	userContainer.setAttribute('href', `https://profile.intra.42.fr/users/${location.user.login}`);
	userContainer.setAttribute('target', '_blank');
	userContainer.setAttribute('data-begin-at', location.begin_at);
	userContainer.setAttribute('data-login', location.user.login);
	userContainer.setAttribute('data-display-name', location.user.display_name);
	userContainer.setAttribute('data-host', location.host);
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
	image.setAttribute('class', 'user-image');
	userContainer.appendChild(image);

	// Draw a circle around the user's image
	const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
	circle.setAttribute('cx', host.getAttribute('cx'));
	circle.setAttribute('cy', host.getAttribute('cy'));
	circle.setAttribute('r', USER_IMAGE_SIZE / 2);
	circle.classList.add('user-circle', 'in-use');
	userContainer.appendChild(circle);

	// Create text element (only shown on hover)
	const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
	text.textContent = location.user.login;
	text.setAttribute('x', host.getAttribute('cx'));
	text.setAttribute('y', parseInt(host.getAttribute('cy')) + USER_IMAGE_SIZE * 0.75);
	text.setAttribute('text-anchor', 'middle');
	text.setAttribute('class', 'user-text');
	userContainer.appendChild(text);

	const svg = host.closest('svg');
	svg.querySelector("#Users").appendChild(userContainer);
}

function removeLocation(location) {
	const host = getHost(location);
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

function updateClustermap(data) {
	console.log(data);
	// Update the clustermap with the new locations
	for (const newLocation of data["added"]) {
		createLocation(newLocation);
	}
	for (const removedLocation of data["removed"]) {
		removeLocation(removedLocation);
	}
}
