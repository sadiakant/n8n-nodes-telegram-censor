import { Api } from 'teleproto';
import { HTMLParser } from 'teleproto/extensions/html';

type Stringable = { toString: () => string } | string | number | bigint;

type TelegramMessageEntityView = {
	className?: string;
	_?: string;
	offset?: number;
	length?: number;
	url?: string;
	userId?: Stringable;
	user_id?: Stringable;
	language?: string;
	documentId?: Stringable;
	document_id?: Stringable;
	date?: number;
	relative?: boolean;
	shortTime?: boolean;
	longTime?: boolean;
	shortDate?: boolean;
	longDate?: boolean;
	dayOfWeek?: boolean;
};

type Replacement = {
	start: number;
	end: number;
	value: string;
};

type TelegramPreparedTextInput = {
	text: string;
	parseMode?: 'html';
	formattingEntities?: Api.TypeMessageEntity[];
};

const SUPPORTED_HTML_TAG_PATTERN =
	/<(a|b|strong|i|em|u|s|strike|del|code|pre|spoiler|blockquote|tg-emoji)\b/i;

const MARKDOWNISH_PATTERN =
	/!\[[^\]]*]\(tg:\/\/emoji\?id=\d+\)|\[[^\]]+]\([^)]+\)|\*\*[\s\S]+?\*\*|~~[\s\S]+?~~|```[\s\S]+?```|`[^`\n]+`|__[\s\S]+?__|\|\|[\s\S]+?\|\||(^|[^\w])_[^_\n]+_($|[^\w])|(^|\n)>\s?.+/m;

const DATE_MARKDOWN_PATTERN = /\[([^\]]+)]\(tg:\/\/date\?([^)]+)\)/g;
const DATE_HTML_PATTERN = /<tg-date\b([^>]*)>([\s\S]*?)<\/tg-date>/gi;
const DATE_LINK_HTML_PATTERN = /<a\s+href="tg:\/\/date\?([^"]+)"\s*>([\s\S]*?)<\/a>/gi;

export function renderTelegramEntities(text: string, entities: unknown[] | undefined): string {
	if (!text || !Array.isArray(entities) || entities.length === 0) {
		return text;
	}

	const htmlRendered = convertTelegramHtmlToMarkdown(
		HTMLParser.unparse(text, entities as Api.TypeMessageEntity[]),
	);
	if (htmlRendered !== text) {
		return htmlRendered;
	}

	return renderTelegramEntitiesFallback(
		text,
		entities.filter(
			(entity): entity is TelegramMessageEntityView =>
				typeof entity === 'object' && entity !== null,
		),
	);
}

export function prepareTelegramTextInput(text: string): TelegramPreparedTextInput {
	if (!text) {
		return { text };
	}

	const hasDateSyntax = DATE_MARKDOWN_PATTERN.test(text) || DATE_HTML_PATTERN.test(text);
	DATE_MARKDOWN_PATTERN.lastIndex = 0;
	DATE_HTML_PATTERN.lastIndex = 0;

	if (!hasDateSyntax && !MARKDOWNISH_PATTERN.test(text) && !SUPPORTED_HTML_TAG_PATTERN.test(text)) {
		return { text };
	}

	if (!hasDateSyntax && SUPPORTED_HTML_TAG_PATTERN.test(text) && !MARKDOWNISH_PATTERN.test(text)) {
		return { text, parseMode: 'html' };
	}

	let html = text;

	html = html.replace(
		/!\[([^\]]*)]\(tg:\/\/emoji\?id=(\d+)\)/g,
		'<tg-emoji emoji-id="$2">$1</tg-emoji>',
	);

	html = html.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_match, language: string, code: string) => {
		const trimmedLanguage = language.trim();
		return trimmedLanguage
			? `<pre><code class="language-${trimmedLanguage}">${code}</code></pre>`
			: `<pre>${code}</pre>`;
	});

	html = html.replace(/(?:^|\n)((?:>\s?.*(?:\n|$))+)/g, (_match, block: string) => {
		const content = block
			.split('\n')
			.filter((line) => line.trim().startsWith('>'))
			.map((line) => line.replace(/^\s*>\s?/, ''))
			.join('\n');
		return `\n<blockquote>${content}</blockquote>`;
	});

	html = html.replace(DATE_MARKDOWN_PATTERN, (_match, label: string, query: string) => {
		const attrs = dateQueryToHtmlAttributes(query);
		return `<tg-date ${attrs}>${label}</tg-date>`;
	});
	html = html.replace(/\|\|([\s\S]+?)\|\|/g, '<spoiler>$1</spoiler>');
	html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');
	html = html.replace(/__([\s\S]+?)__/g, '<em>$1</em>');
	html = html.replace(/(^|[^\w])_([^_\n]+)_($|[^\w])/gm, '$1<em>$2</em>$3');
	html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
	html = html.replace(/\[([^\]]+)]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

	if (!hasDateSyntax) {
		return { text: html, parseMode: 'html' };
	}

	html = html.replace(DATE_LINK_HTML_PATTERN, (_match, query: string, label: string) => {
		const attrs = dateQueryToHtmlAttributes(query);
		return `<tg-date ${attrs}>${label}</tg-date>`;
	});

	return parseTelegramTextInputWithDates(html);
}

function convertTelegramHtmlToMarkdown(html: string): string {
	return html
		.replace(
			/<pre><code class="language-([^"]+)">([\s\S]*?)<\/code><\/pre>/g,
			(_match, language: string, code: string) => `\`\`\`${language}\n${code}\`\`\``,
		)
		.replace(/<pre>([\s\S]*?)<\/pre>/g, (_match, code: string) => `\`\`\`${code}\`\`\``)
		.replace(/<blockquote(?:\s+expandable)?>([\s\S]*?)<\/blockquote>/g, (_match, content: string) =>
			content
				.split('\n')
				.map((line) => (line.length > 0 ? `> ${line}` : '>'))
				.join('\n'),
		)
		.replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**')
		.replace(/<em>([\s\S]*?)<\/em>/g, '_$1_')
		.replace(/<del>([\s\S]*?)<\/del>/g, '~~$1~~')
		.replace(/<code>([\s\S]*?)<\/code>/g, '`$1`')
		.replace(/<u>([\s\S]*?)<\/u>/g, '<u>$1</u>')
		.replace(/<spoiler>([\s\S]*?)<\/spoiler>/g, '||$1||')
		.replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/g, '[$2]($1)')
		.replace(/<tg-emoji emoji-id="([^"]+)">([\s\S]*?)<\/tg-emoji>/g, '![$2](tg://emoji?id=$1)');
}

function renderTelegramEntitiesFallback(
	text: string,
	entities: TelegramMessageEntityView[],
): string {
	const replacements: Replacement[] = [];

	for (const entity of entities) {
		const start = entity.offset ?? 0;
		const length = entity.length ?? 0;
		const end = start + length;

		if (start < 0 || length <= 0 || end > text.length) {
			continue;
		}

		const entityText = text.slice(start, end);
		const rendered = renderEntityText(entity, entityText);
		if (rendered !== entityText) {
			replacements.push({ start, end, value: rendered });
		}
	}

	if (replacements.length === 0) {
		return text;
	}

	replacements.sort((a, b) => {
		if (a.start !== b.start) {
			return b.start - a.start;
		}

		return b.end - a.end;
	});

	let result = text;
	let lastAppliedStart = Number.MAX_SAFE_INTEGER;

	for (const replacement of replacements) {
		if (replacement.end > lastAppliedStart) {
			continue;
		}

		result = result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end);
		lastAppliedStart = replacement.start;
	}

	return result;
}

function renderEntityText(entity: TelegramMessageEntityView, entityText: string): string {
	const entityType = entity.className ?? entity._ ?? '';

	switch (entityType) {
		case 'MessageEntityTextUrl':
		case 'messageEntityTextUrl':
			return entity.url ? `[${entityText}](${entity.url})` : entityText;
		case 'MessageEntityUrl':
		case 'messageEntityUrl':
			return `[${entityText}](${entityText})`;
		case 'MessageEntityEmail':
		case 'messageEntityEmail':
			return `[${entityText}](mailto:${entityText})`;
		case 'MessageEntityPhone':
		case 'messageEntityPhone':
			return `[${entityText}](tel:${entityText})`;
		case 'MessageEntityBold':
		case 'messageEntityBold':
			return `**${entityText}**`;
		case 'MessageEntityItalic':
		case 'messageEntityItalic':
			return `_${entityText}_`;
		case 'MessageEntityStrike':
		case 'messageEntityStrike':
			return `~~${entityText}~~`;
		case 'MessageEntityUnderline':
		case 'messageEntityUnderline':
			return `<u>${entityText}</u>`;
		case 'MessageEntitySpoiler':
		case 'messageEntitySpoiler':
			return `||${entityText}||`;
		case 'MessageEntityCode':
		case 'messageEntityCode':
			return `\`${entityText}\``;
		case 'MessageEntityPre':
		case 'messageEntityPre':
			return `\`\`\`${entity.language ? entity.language + '\n' : ''}${entityText}\`\`\``;
		case 'MessageEntityBlockquote':
		case 'messageEntityBlockquote':
			return entityText
				.split('\n')
				.map((line) => (line.length > 0 ? `> ${line}` : '>'))
				.join('\n');
		case 'MessageEntityMentionName':
		case 'messageEntityMentionName':
		case 'InputMessageEntityMentionName':
		case 'inputMessageEntityMentionName': {
			const userId = toIdString(entity.userId ?? entity.user_id);
			return userId ? `[${entityText}](tg://user?id=${userId})` : entityText;
		}
		case 'MessageEntityCustomEmoji':
		case 'messageEntityCustomEmoji': {
			const documentId = toIdString(entity.documentId ?? entity.document_id);
			return documentId ? `![${entityText}](tg://emoji?id=${documentId})` : entityText;
		}
		case 'MessageEntityFormattedDate':
		case 'messageEntityFormattedDate':
			return renderFormattedDateEntity(entity, entityText);
		default:
			return entityText;
	}
}

function parseTelegramTextInputWithDates(html: string): TelegramPreparedTextInput {
	const entities: Api.TypeMessageEntity[] = [];
	const textParts: string[] = [];
	let currentOffset = 0;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	DATE_HTML_PATTERN.lastIndex = 0;

	while ((match = DATE_HTML_PATTERN.exec(html)) !== null) {
		const [fullMatch, rawAttributes, label] = match;
		const prefix = html.slice(lastIndex, match.index);
		const [prefixText, prefixEntities] = parseHtmlSegmentPreserveWhitespace(prefix);
		textParts.push(prefixText);
		entities.push(...shiftEntities(prefixEntities, currentOffset));
		currentOffset += prefixText.length;

		const plainLabel = decodeHtmlEntities(label);
		textParts.push(plainLabel);

		const dateEntity = buildFormattedDateEntity(rawAttributes, currentOffset, plainLabel.length);
		if (dateEntity) {
			entities.push(dateEntity);
		}

		currentOffset += plainLabel.length;
		lastIndex = match.index + fullMatch.length;
	}

	const suffix = html.slice(lastIndex);
	const [suffixText, suffixEntities] = parseHtmlSegmentPreserveWhitespace(suffix);
	textParts.push(suffixText);
	entities.push(...shiftEntities(suffixEntities, currentOffset));

	return {
		text: textParts.join(''),
		formattingEntities: entities,
	};
}

function parseHtmlSegmentPreserveWhitespace(segment: string): [string, Api.TypeMessageEntity[]] {
	if (!segment) {
		return ['', []];
	}

	const leadingWhitespaceMatch = segment.match(/^\s+/);
	const trailingWhitespaceMatch = segment.match(/\s+$/);
	const leadingWhitespace = leadingWhitespaceMatch?.[0] ?? '';
	const trailingWhitespace = trailingWhitespaceMatch?.[0] ?? '';
	const coreStart = leadingWhitespace.length;
	const coreEnd = segment.length - trailingWhitespace.length;
	const core = coreEnd > coreStart ? segment.slice(coreStart, coreEnd) : '';

	if (!core) {
		return [segment, []];
	}

	const [parsedCoreText, parsedCoreEntities] = HTMLParser.parse(core);
	const shiftedEntities = shiftEntities(parsedCoreEntities, leadingWhitespace.length);

	return [`${leadingWhitespace}${parsedCoreText}${trailingWhitespace}`, shiftedEntities];
}

function shiftEntities(
	entities: Api.TypeMessageEntity[] | undefined,
	offset: number,
): Api.TypeMessageEntity[] {
	if (!entities?.length) {
		return [];
	}

	return entities.map((entity) => {
		const adjusted = entity as Api.TypeMessageEntity & { offset: number };
		adjusted.offset += offset;
		return adjusted;
	});
}

function buildFormattedDateEntity(
	rawAttributes: string,
	offset: number,
	length: number,
): Api.MessageEntityFormattedDate | null {
	if (length <= 0) {
		return null;
	}

	const attributes = parseHtmlAttributes(rawAttributes);
	const rawDate = attributes.date ?? attributes.timestamp ?? attributes.ts;
	const parsedDate = rawDate ? parseInt(rawDate, 10) : NaN;
	if (!Number.isFinite(parsedDate)) {
		return null;
	}

	return new Api.MessageEntityFormattedDate({
		offset,
		length,
		date: parsedDate,
		relative: parseBooleanAttribute(attributes.relative),
		shortTime: parseBooleanAttribute(attributes.shortTime ?? attributes['short-time']),
		longTime: parseBooleanAttribute(attributes.longTime ?? attributes['long-time']),
		shortDate: parseBooleanAttribute(attributes.shortDate ?? attributes['short-date']),
		longDate: parseBooleanAttribute(attributes.longDate ?? attributes['long-date']),
		dayOfWeek: parseBooleanAttribute(attributes.dayOfWeek ?? attributes['day-of-week']),
	});
}

function renderFormattedDateEntity(entity: TelegramMessageEntityView, entityText: string): string {
	const dateValue =
		typeof (entity as { date?: number }).date === 'number'
			? (entity as { date: number }).date
			: undefined;
	if (!dateValue) {
		return entityText;
	}

	const query = new URLSearchParams();
	query.set('date', String(dateValue));

	appendBooleanQuery(query, 'relative', (entity as { relative?: boolean }).relative);
	appendBooleanQuery(query, 'shortTime', (entity as { shortTime?: boolean }).shortTime);
	appendBooleanQuery(query, 'longTime', (entity as { longTime?: boolean }).longTime);
	appendBooleanQuery(query, 'shortDate', (entity as { shortDate?: boolean }).shortDate);
	appendBooleanQuery(query, 'longDate', (entity as { longDate?: boolean }).longDate);
	appendBooleanQuery(query, 'dayOfWeek', (entity as { dayOfWeek?: boolean }).dayOfWeek);

	return `[${entityText}](tg://date?${query.toString()})`;
}

function appendBooleanQuery(query: URLSearchParams, key: string, value: boolean | undefined): void {
	if (value) {
		query.set(key, '1');
	}
}

function parseHtmlAttributes(rawAttributes: string): Record<string, string> {
	const attributes: Record<string, string> = {};
	const attrRegex = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
	let match: RegExpExecArray | null;
	while ((match = attrRegex.exec(rawAttributes)) !== null) {
		const name = match[1];
		const value = match[2] || match[3] || match[4] || '';
		attributes[name] = value;
	}
	return attributes;
}

function parseBooleanAttribute(value: string | undefined): boolean | undefined {
	if (value === undefined) {
		return undefined;
	}

	const normalized = value.trim().toLowerCase();
	return normalized === '' || normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}

function dateQueryToHtmlAttributes(query: string): string {
	const params = new URLSearchParams(query);
	const attributes: string[] = [];

	for (const [key, value] of params.entries()) {
		attributes.push(`${key}="${escapeHtmlAttribute(value)}"`);
	}

	return attributes.join(' ');
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function toIdString(value: Stringable | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}

	return value.toString();
}
