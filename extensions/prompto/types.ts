export type FieldType = "string" | "text" | "boolean" | "choice" | "multichoice" | "number";

export type FieldValue = string | number | boolean | string[];

export interface TemplateField {
	name: string;
	label?: string;
	type: FieldType;
	help?: string;
	placeholder?: string;
	default?: FieldValue;
	required?: boolean;
	choices?: string[];
}

export interface PrefillSpec {
	fields: string[];
	prompt: string;
	when: "before-form" | "after-required";
}

export type TemplateKind = "template" | "plain" | "plugin";
export type TemplateSource = "project" | "global";

export interface PromptTemplate {
	/** Addressable id, e.g. "docmgr/create-ticket". */
	name: string;
	/** First path segment of the name, e.g. "docmgr". */
	group: string;
	title?: string;
	description?: string;
	submit: "editor" | "auto";
	fields: TemplateField[];
	prefill?: PrefillSpec;
	/** Markdown body after frontmatter (empty for plugins). */
	body: string;
	/** Absolute path of the template file or plugin executable. */
	filePath: string;
	source: TemplateSource;
	kind: TemplateKind;
	/** For kind "plugin": the template name to pass in render requests. */
	pluginTemplateName?: string;
}

export interface PromptoConfig {
	submitDefault: "editor" | "auto";
	allowProjectPlugins: boolean;
	prefillMaxTokens: number;
}
