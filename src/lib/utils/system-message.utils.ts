import { i18n } from '$lib/services/i18n.svelte';

export function translateRallySystemMessage(text: string | undefined | null): string {
	if (!text) return '';

	const lang = i18n.currentLang;
	if (lang === 'en') return text;

	if (text === 'Welcome to Rally! You will receive event updates and more through this chat.') {
		return i18n.t('welcome_personal');
	}

	if (
		text ===
		'Welcome to Rally! You will receive organization updates and event activity through this chat.'
	) {
		return i18n.t('welcome_org');
	}

	let match = text.match(/^You joined "(.+)" on (.+) at (.+)\.$/);
	if (match) {
		const [, eventTitle, eventDate, eventLocation] = match;
		if (lang === 'pt') return `Juntaste-te a "${eventTitle}" em ${eventDate} no local ${eventLocation}.`;
		if (lang === 'es') return `Te uniste a "${eventTitle}" el ${eventDate} en ${eventLocation}.`;
		if (lang === 'fr') return `Vous avez rejoint "${eventTitle}" le ${eventDate} à ${eventLocation}.`;
	}

	match = text.match(/^You left "(.+)"\.$/);
	if (match) {
		const [, eventTitle] = match;
		if (lang === 'pt') return `Saíste de "${eventTitle}".`;
		if (lang === 'es') return `Saliste de "${eventTitle}".`;
		if (lang === 'fr') return `Vous avez quitté "${eventTitle}".`;
	}

	match = text.match(/^You were removed from "(.+)" by the host\.$/);
	if (match) {
		const [, eventTitle] = match;
		if (lang === 'pt') return `Foste removido de "${eventTitle}" pelo organizador.`;
		if (lang === 'es') return `Fuiste eliminado de "${eventTitle}" por el organizador.`;
		if (lang === 'fr') return `Vous avez été retiré de "${eventTitle}" par l'organisateur.`;
	}

	match = text.match(
		/^Promotion started for "(.+)". You can follow its views, clicks and spend in the organization dashboard\.$/
	);
	if (match) {
		const [, eventTitle] = match;
		if (lang === 'pt') return `A promoção do evento "${eventTitle}" começou. Podes acompanhar as visualizações, cliques e gastos no painel da organização.`;
		if (lang === 'es') return `La promoción de "${eventTitle}" ha comenzado. Puedes seguir sus vistas, clics y gastos en el panel de la organización.`;
		if (lang === 'fr') return `La promotion a commencé pour "${eventTitle}". Vous pouvez suivre ses vues, clics et dépenses dans le tableau de bord de l'organisation.`;
	}

	match = text.match(
		/^Promotion ended for "(.+)". Its final results remain available in the organization dashboard\.$/
	);
	if (match) {
		const [, eventTitle] = match;
		if (lang === 'pt') return `A promoção do evento "${eventTitle}" terminou. Os resultados finais continuam disponíveis no painel da organização.`;
		if (lang === 'es') return `La promoción de "${eventTitle}" ha finalizado. Sus resultados finales siguen disponibles en el panel de la organización.`;
		if (lang === 'fr') return `La promotion est terminée pour "${eventTitle}". Ses résultats finaux restent disponibles dans le tableau de bord de l'organisation.`;
	}

	match = text.match(/^(.+) created "(.+)" on (.+)\.$/);
	if (match) {
		const [, orgName, eventTitle, eventDate] = match;
		if (lang === 'pt') return `${orgName} criou o evento "${eventTitle}" em ${eventDate}.`;
		if (lang === 'es') return `${orgName} creó el evento "${eventTitle}" el ${eventDate}.`;
		if (lang === 'fr') return `${orgName} a créé l'événement "${eventTitle}" le ${eventDate}.`;
	}

	match = text.match(/^(.+) created "(.+)"\.$/);
	if (match) {
		const [, orgName, eventTitle] = match;
		if (lang === 'pt') return `${orgName} criou o evento "${eventTitle}".`;
		if (lang === 'es') return `${orgName} creó el evento "${eventTitle}".`;
		if (lang === 'fr') return `${orgName} a créé l'événement "${eventTitle}".`;
	}

	match = text.match(/^(.+) is promoting "(.+)" in Rally\.$/);
	if (match) {
		const [, orgName, eventTitle] = match;
		if (lang === 'pt') return `${orgName} está a promover "${eventTitle}" no Rally.`;
		if (lang === 'es') return `${orgName} está promocionando "${eventTitle}" en Rally.`;
		if (lang === 'fr') return `${orgName} fait la promotion de "${eventTitle}" sur Rally.`;
	}

	match = text.match(/^(.+) wants to join "(.+)". Review the request on the event page\.$/);
	if (match) {
		const [, requesterName, eventTitle] = match;
		if (lang === 'pt') return `${requesterName} quer juntar-se a "${eventTitle}". Revê o pedido na página do evento.`;
		if (lang === 'es') return `${requesterName} quiere unirse a "${eventTitle}". Revisa la solicitud en la página del evento.`;
		if (lang === 'fr') return `${requesterName} souhaite rejoindre "${eventTitle}". Vérifiez la demande sur la page de l'événement.`;
	}

	match = text.match(/^Your request to join "(.+)" was approved. You're in!$/);
	if (match) {
		const [, eventTitle] = match;
		if (lang === 'pt') return `O teu pedido para te juntares a "${eventTitle}" foi aprovado. Já estás dentro!`;
		if (lang === 'es') return `Tu solicitud para unirte a "${eventTitle}" fue aprobada. ¡Ya estás dentro!`;
		if (lang === 'fr') return `Votre demande pour rejoindre "${eventTitle}" a été approuvée. Vous y êtes !`;
	}

	match = text.match(/^Your request to join "(.+)" was declined\.$/);
	if (match) {
		const [, eventTitle] = match;
		if (lang === 'pt') return `O teu pedido para te juntares a "${eventTitle}" foi recusado.`;
		if (lang === 'es') return `Tu solicitud para unirte a "${eventTitle}" fue rechazada.`;
		if (lang === 'fr') return `Votre demande pour rejoindre "${eventTitle}" a été refusée.`;
	}

	return text;
}
