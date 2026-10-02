const WORKING = [
    'Working on it, sir.',
    'Compiling.',
    'Retrieving.',
    'Accessing the archive.',
    'Cross-referencing.',
    'Running the query now.',
    'Searching.',
    'Under way.',
];
const ACKNOWLEDGE = [
    'As you wish, sir.',
    'Very good, sir.',
    'Certainly.',
    'Understood.',
    'Consider it done.',
    'Directly, sir.',
];
const ATTENTION = [
    'Yes, sir?',
    'Sir?',
    'At your service, sir.',
    'Standing by.',
    'Awake, sir.',
];
function makePicker(pool: string[]) {
    let last = -1;
    return () => {
        if (pool.length < 2)
            return pool[0] ?? '';
        let i = last;
        while (i === last)
            i = Math.floor(Math.random() * pool.length);
        last = i;
        return pool[i];
    };
}
export const working = makePicker(WORKING);
export const acknowledge = makePicker(ACKNOWLEDGE);
export const attention = makePicker(ATTENTION);
type Rule = {
    server?: RegExp;
    tool?: RegExp;
    lines: string[];
};
const FOOTAGE = ['Assembling the footage.', 'Rendering the sequence.'];
const BY_TOOL: Rule[] = [
    { tool: /video|footage|\bclip\b|\breel\b|talking_head/, lines: FOOTAGE },
    {
        server: /higgsfield|openrouter-image|dalle|flux|midjourney/,
        tool: /image|photo|thumbnail|render|upscale|seedream/,
        lines: ['Rendering.', 'Composing it now.'],
    },
    { server: /palmier|heygen|runway|descript/, lines: FOOTAGE },
    {
        server: /playwright|puppeteer|browserbase|chrome/,
        tool: /\bbrowser\b|navigate/,
        lines: ['Opening the browser.', 'Navigating.'],
    },
    {
        server: /android|\badb\b|simulator/,
        tool: /\bdevice\b|\bapk\b|\bphone\b/,
        lines: ['Reaching the device.', 'Connecting to your phone.'],
    },
    {
        server: /gmail|\bmail\b/,
        tool: /gmail|\bmail\b|email|inbox/,
        lines: ['Checking your mail.', 'Reading the inbox.'],
    },
    {
        tool: /calendar|\bdiary\b|\bmeeting\b/,
        lines: ['Checking your calendar.', 'Consulting the diary.'],
    },
    {
        server: /elevenlabs|openai-tts/,
        tool: /speech|\bvoice\b|\btts\b|text_to_sound/,
        lines: ['Synthesising.', 'Working on it, sir.'],
    },
    {
        server: /spotify|sonos/,
        tool: /\bplay\b|\bmusic\b|playlist|\btrack\b/,
        lines: ['Queuing it up.', 'Putting it on.'],
    },
    {
        server: /^home|homeassistant|\bhue\b|\bhass\b/,
        tool: /\blights?\b|thermostat|\bdimmer\b/,
        lines: ['Adjusting it now.', 'Seeing to it, sir.'],
    },
    {
        server: /github|linear|jira|sentry/,
        tool: /\brepo\b|repository|\bissues?\b|pull_request|\bcommit\b/,
        lines: ['Checking the repository.', 'Consulting the tracker.'],
    },
    {
        server: /mixpanel|clarity|posthog|amplitude/,
        tool: /analytic|\bmetrics?\b|\breports?\b|\bevents?\b|cohort|funnel|dashboard|\bquery\b/,
        lines: ['Running the query.', 'Pulling the figures.'],
    },
    {
        server: /\bexa\b|serper|serpapi|perplexity|tavily|brave/,
        tool: /search|\bweb\b|\bfetch\b|crawl|research/,
        lines: ['Searching.', 'Consulting the record.'],
    },
];
const pickers = BY_TOOL.map((r) => ({ ...r, pick: makePicker(r.lines) }));
function split(toolName: string): {
    server: string;
    tool: string;
} {
    const raw = /^mcp__(.+?)__(.+)$/.exec(toolName);
    if (raw)
        return { server: raw[1].toLowerCase(), tool: raw[2].toLowerCase() };
    const pretty = toolName.split(' · ');
    if (pretty.length === 2) {
        return { server: pretty[0].toLowerCase(), tool: pretty[1].toLowerCase() };
    }
    return { server: '', tool: toolName.toLowerCase() };
}
export function forTool(toolName: string): string {
    const { server, tool } = split(toolName);
    for (const r of pickers) {
        const hit = (r.server !== undefined && server !== '' && r.server.test(server)) ||
            (r.tool !== undefined && r.tool.test(tool));
        if (hit)
            return r.pick();
    }
    return working();
}
