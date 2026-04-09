import type { ContentfulStatusCode } from "hono/utils/http-status";

const KNOWN_UNITS = new Set([
  "g",
  "kg",
  "mg",
  "ml",
  "cl",
  "dl",
  "l",
  "tsk",
  "msk",
  "krm",
  "st",
  "gr",
  "gram",
  "kilogram",
  "milligram",
  "milliliter",
  "centiliter",
  "deciliter",
  "liter",
  "tesked",
  "teskedar",
  "matsked",
  "matskedar",
  "kryddm\u00e5tt",
  "styck",
  "stck",
  "stycken",
  "nypa",
  "nypor",
]);

const UNIT_ALIASES: Record<string, string> = {
  tbsp: "msk",
  tbsps: "msk",
  tablespoon: "msk",
  tablespoons: "msk",
  tsp: "tsk",
  tsps: "tsk",
  teaspoon: "tsk",
  teaspoons: "tsk",
};

const UNICODE_FRACTIONS = new Map([
  ["1/2", 0.5],
  ["1/3", 1 / 3],
  ["2/3", 2 / 3],
  ["1/4", 0.25],
  ["3/4", 0.75],
  ["1/8", 0.125],
  ["3/8", 0.375],
  ["5/8", 0.625],
  ["7/8", 0.875],
  ["\u00bd", 0.5],
  ["\u2153", 1 / 3],
  ["\u2154", 2 / 3],
  ["\u00bc", 0.25],
  ["\u00be", 0.75],
  ["\u215b", 0.125],
  ["\u215c", 0.375],
  ["\u215d", 0.625],
  ["\u215e", 0.875],
]);

const DOM_INGREDIENT_LIST_CLASSES = [
  "ingredients",
  "recipe-ingredients",
  "ingredients-list",
];

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export class RecipeScrapeError extends Error {
  status: ContentfulStatusCode;

  constructor(status: ContentfulStatusCode, message: string) {
    super(message);
    this.name = "RecipeScrapeError";
    this.status = status;
  }
}

export type ScrapedIngredient = {
  name: string;
  quantity: number | null;
  unit: string;
  rawText: string;
};

export type ScrapedRecipe = {
  title: string | null;
  ingredientsRaw: string | null;
  ingredients: ScrapedIngredient[];
};

type JsonLdRecipeData = {
  title: string | null;
  ingredients: string[];
};

type JsonRecord = Record<string, unknown>;

type QuantityParseResult = {
  quantity: number;
  tokensConsumed: number;
};

type IngredientLineStructure = {
  quantity: number | null;
  unit: string;
  nameStartIndex: number;
};

type NormalizeIngredientLineOptions = {
  domLines?: string[];
};

type HtmlAttributes = Record<string, string>;

type OpenHtmlTag = {
  tagName: string;
  attributes: HtmlAttributes;
  capturedTextParts: string[] | null;
};

type HtmlMatcher = (
  tagName: string,
  attributes: HtmlAttributes,
  ancestors: OpenHtmlTag[],
) => boolean;

export const scrapeRecipeFromUrl = async (
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ScrapedRecipe> => {
  const html = await fetchRecipeHtml(url, fetchImpl);
  return extractScrapedRecipeFromHtml(html);
};

export const fetchRecipeHtml = async (
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> => {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "recipe-service-ts/1.0",
    },
  });

  if (!response.ok) {
    throw new RecipeScrapeError(
      502,
      `Failed to fetch recipe page (${response.status})`,
    );
  }

  const contentType = response.headers.get("content-type")?.toLowerCase();

  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml")
  ) {
    throw new RecipeScrapeError(502, "Recipe URL did not return an HTML page");
  }

  return await response.text();
};

export const extractScrapedRecipeFromHtml = (html: string): ScrapedRecipe => {
  const jsonLdRecipe = extractRecipeFromJsonLd(html);
  const domIngredientLines = extractRecipeFromDom(html);
  let ingredientLines = domIngredientLines;
  let domLines: string[] | undefined;

  if (jsonLdRecipe.ingredients.length > 0) {
    ingredientLines = jsonLdRecipe.ingredients;
    domLines = domIngredientLines;
  }

  const normalizedLines = normalizeIngredientLines(ingredientLines, {
    domLines,
  });

  if (normalizedLines.length === 0) {
    throw new RecipeScrapeError(
      422,
      "No ingredients could be extracted from the recipe page",
    );
  }

  const ingredients: ScrapedIngredient[] = [];

  for (const line of normalizedLines) {
    ingredients.push(parseIngredientLine(line));
  }

  return {
    title: jsonLdRecipe.title ?? extractPageTitle(html),
    ingredientsRaw: normalizedLines.join("\n"),
    ingredients,
  };
};

export const extractRecipeFromJsonLd = (html: string): JsonLdRecipeData => {
  let title: string | null = null;
  const ingredients: string[] = [];
  const seenIngredients = new Set<string>();

  const scriptContents = extractTextFromHtml(html, (tagName, attributes) => {
    return tagName === "script" && attributes.type === "application/ld+json";
  });

  for (const rawJson of scriptContents) {
    if (!rawJson) {
      continue;
    }

    try {
      const parsedJson = JSON.parse(rawJson);
      const jsonObjects = collectJsonLdObjects(parsedJson);

      for (const jsonObject of jsonObjects) {
        if (!isRecipeNode(jsonObject)) {
          continue;
        }

        if (!title) {
          const recipeTitle = getTextValue(jsonObject.name);

          if (recipeTitle) {
            title = recipeTitle;
          }
        }

        const recipeIngredients = Array.isArray(jsonObject.recipeIngredient)
          ? jsonObject.recipeIngredient
          : [];

        for (const ingredientValue of recipeIngredients) {
          const ingredientLine = cleanIngredientLine(
            getTextValue(ingredientValue),
          );

          if (!ingredientLine || seenIngredients.has(ingredientLine)) {
            continue;
          }

          seenIngredients.add(ingredientLine);
          ingredients.push(ingredientLine);
        }
      }
    } catch {
      continue;
    }
  }

  return {
    title,
    ingredients,
  };
};

export const extractRecipeFromDom = (html: string): string[] => {
  const ingredientPropertyLines = collectUniqueIngredientLines(
    extractTextFromHtml(html, (_, attributes) => {
      return attributes.itemprop === "recipeIngredient";
    }),
  );

  if (ingredientPropertyLines.length > 0) {
    return ingredientPropertyLines;
  }

  for (const className of DOM_INGREDIENT_LIST_CLASSES) {
    const ingredientLines = collectUniqueIngredientLines(
      extractTextFromHtml(html, (tagName, _, ancestors) => {
        if (tagName !== "li") {
          return false;
        }

        for (const ancestor of ancestors) {
          if (hasClassName(ancestor.attributes, className)) {
            return true;
          }
        }

        return false;
      }),
    );

    if (ingredientLines.length > 0) {
      return ingredientLines;
    }
  }

  return [];
};

export const normalizeIngredientLines = (
  lines: string[],
  options: NormalizeIngredientLineOptions = {},
): string[] => {
  const cleanedLines: string[] = [];

  for (const line of lines) {
    const cleanedLine = cleanIngredientLine(line);

    if (cleanedLine) {
      cleanedLines.push(cleanedLine);
    }
  }

  const cleanedDomLines: string[] = [];

  for (const line of options.domLines ?? []) {
    const cleanedLine = cleanIngredientLine(line);

    if (cleanedLine) {
      cleanedDomLines.push(cleanedLine);
    }
  }

  const domLineSet = new Set(cleanedDomLines);
  let domOverlapCount = 0;

  for (const cleanedLine of cleanedLines) {
    if (domLineSet.has(cleanedLine)) {
      domOverlapCount += 1;
    }
  }

  const hasReliableDomSignal =
    cleanedDomLines.length > 0 && domOverlapCount / cleanedDomLines.length >= 0.5;
  const normalizedLines: string[] = [];
  const seenLines = new Set<string>();

  for (let index = 0; index < cleanedLines.length; index += 1) {
    const cleanedLine = cleanedLines[index];

    if (
      isIngredientSectionHeader(
        cleanedLine,
        cleanedLines,
        index,
        domLineSet,
        hasReliableDomSignal,
      )
    ) {
      continue;
    }

    if (seenLines.has(cleanedLine)) {
      continue;
    }

    seenLines.add(cleanedLine);
    normalizedLines.push(cleanedLine);
  }

  return normalizedLines;
};

export const parseIngredientLine = (line: string): ScrapedIngredient => {
  const cleanedLine = cleanIngredientLine(line);

  if (!cleanedLine) {
    return {
      name: "Unknown ingredient",
      quantity: null,
      unit: "",
      rawText: "",
    };
  }

  const tokens = cleanedLine.split(/\s+/);
  const structure = parseIngredientStructure(tokens);
  const ingredientName =
    joinTokens(tokens, structure.nameStartIndex) || cleanedLine;

  return {
    name: ingredientName,
    quantity: structure.quantity,
    unit: structure.unit,
    rawText: cleanedLine,
  };
};

const extractPageTitle = (html: string) => {
  const titles = extractTextFromHtml(html, (tagName) => tagName === "title");
  return normalizeWhitespace(titles[0]);
};

const collectUniqueIngredientLines = (lines: string[]) => {
  const cleanedLines: string[] = [];
  const seenLines = new Set<string>();

  for (const line of lines) {
    const cleanedLine = cleanIngredientLine(line);

    if (!cleanedLine || seenLines.has(cleanedLine)) {
      continue;
    }

    seenLines.add(cleanedLine);
    cleanedLines.push(cleanedLine);
  }

  return cleanedLines;
};

const extractTextFromHtml = (html: string, matcher: HtmlMatcher): string[] => {
  const results: string[] = [];
  const openTags: OpenHtmlTag[] = [];
  const tagPattern = /<!--[\s\S]*?-->|<\/?[^>]+>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(html)) !== null) {
    const rawText = html.slice(lastIndex, match.index);

    if (rawText) {
      appendTextToCapturedTags(openTags, rawText);
    }

    const tag = match[0];

    if (!tag.startsWith("<!--")) {
      processHtmlTag(tag, openTags, results, matcher);
    }

    lastIndex = tagPattern.lastIndex;
  }

  const remainingText = html.slice(lastIndex);

  if (remainingText) {
    appendTextToCapturedTags(openTags, remainingText);
  }

  closeRemainingTags(openTags, results);

  return results
    .map((result) => normalizeWhitespace(result))
    .filter((result) => Boolean(result));
};

const appendTextToCapturedTags = (openTags: OpenHtmlTag[], text: string) => {
  for (const openTag of openTags) {
    if (openTag.capturedTextParts) {
      openTag.capturedTextParts.push(text);
    }
  }
};

const processHtmlTag = (
  tag: string,
  openTags: OpenHtmlTag[],
  results: string[],
  matcher: HtmlMatcher,
) => {
  const tagName = getTagName(tag);

  if (!tagName) {
    return;
  }

  if (tag.startsWith("</")) {
    closeHtmlTag(tagName, openTags, results);
    return;
  }

  if (tag.startsWith("<!")) {
    return;
  }

  const attributes = parseHtmlAttributes(tag);
  const captureThisTag = matcher(tagName, attributes, openTags);
  const openTag: OpenHtmlTag = {
    tagName,
    attributes,
    capturedTextParts: captureThisTag ? [] : null,
  };

  if (isSelfClosingTag(tag, tagName)) {
    if (openTag.capturedTextParts) {
      results.push(openTag.capturedTextParts.join(""));
    }

    return;
  }

  openTags.push(openTag);
};

const closeHtmlTag = (
  tagName: string,
  openTags: OpenHtmlTag[],
  results: string[],
) => {
  while (openTags.length > 0) {
    const openTag = openTags.pop();

    if (!openTag) {
      return;
    }

    if (openTag.capturedTextParts) {
      results.push(openTag.capturedTextParts.join(""));
    }

    if (openTag.tagName === tagName) {
      return;
    }
  }
};

const closeRemainingTags = (openTags: OpenHtmlTag[], results: string[]) => {
  while (openTags.length > 0) {
    const openTag = openTags.pop();

    if (openTag?.capturedTextParts) {
      results.push(openTag.capturedTextParts.join(""));
    }
  }
};

const getTagName = (tag: string) => {
  const match = tag.match(/^<\/?\s*([^\s/>]+)/);
  return match?.[1]?.toLowerCase() ?? "";
};

const parseHtmlAttributes = (tag: string): HtmlAttributes => {
  const attributes: HtmlAttributes = {};
  const attributePattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(tag)) !== null) {
    const attributeName = match[1].toLowerCase();

    if (attributeName === getTagName(tag)) {
      continue;
    }

    attributes[attributeName] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attributes;
};

const isSelfClosingTag = (tag: string, tagName: string) => {
  return tag.endsWith("/>") || VOID_TAGS.has(tagName);
};

const hasClassName = (attributes: HtmlAttributes, className: string) => {
  const classValue = attributes.class;

  if (!classValue) {
    return false;
  }

  return classValue
    .split(/\s+/)
    .some((currentClassName) => currentClassName === className);
};

const collectJsonLdObjects = (value: unknown): JsonRecord[] => {
  const objects: JsonRecord[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      objects.push(...collectJsonLdObjects(item));
    }

    return objects;
  }

  if (!isJsonRecord(value)) {
    return objects;
  }

  objects.push(value);

  const graphValue = value["@graph"];

  if (Array.isArray(graphValue)) {
    for (const graphNode of graphValue) {
      objects.push(...collectJsonLdObjects(graphNode));
    }
  }

  return objects;
};

const isJsonRecord = (value: unknown): value is JsonRecord => {
  return Boolean(value) && typeof value === "object";
};

const isRecipeNode = (value: JsonRecord) => {
  const typeValue = value["@type"];

  if (typeof typeValue === "string") {
    return typeValue.toLowerCase().includes("recipe");
  }

  if (Array.isArray(typeValue)) {
    for (const entry of typeValue) {
      if (typeof entry === "string" && entry.toLowerCase().includes("recipe")) {
        return true;
      }
    }
  }

  return false;
};

const getTextValue = (value: unknown) => {
  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }

  if (!isJsonRecord(value)) {
    return "";
  }

  if (typeof value.text === "string") {
    return normalizeWhitespace(value.text);
  }

  if (typeof value.name === "string") {
    return normalizeWhitespace(value.name);
  }

  return "";
};

const cleanIngredientLine = (line: string | null | undefined) => {
  const lineWithoutBullets = normalizeWhitespace(line).replace(
    /^[\-\*\u2022\s]+/,
    "",
  );

  if (!lineWithoutBullets) {
    return "";
  }

  return normalizeIngredientWords(lineWithoutBullets).trim();
};

const normalizeIngredientWords = (line: string) => {
  const tokens = line.split(/\s+/);
  const normalizedTokens: string[] = [];

  for (const token of tokens) {
    normalizedTokens.push(replaceUnitAlias(token));
  }

  return normalizedTokens.join(" ");
};

const replaceUnitAlias = (token: string) => {
  const match = token.match(
    /^([^a-z\u00e5\u00e4\u00f6]*)([a-z\u00e5\u00e4\u00f6]+)([^a-z\u00e5\u00e4\u00f6]*)$/i,
  );

  if (!match) {
    return token;
  }

  const [, prefix, word, suffix] = match;
  const replacement = UNIT_ALIASES[word.toLowerCase()];

  if (!replacement) {
    return token;
  }

  return `${prefix}${replacement}${suffix}`;
};

const isIngredientSectionHeader = (
  line: string,
  cleanedLines: string[],
  index: number,
  domLineSet: Set<string>,
  hasReliableDomSignal: boolean,
) => {
  const candidate = stripTrailingHeaderPunctuation(line);

  if (!candidate || /\d/.test(candidate) || /[(),]/.test(candidate)) {
    return false;
  }

  const tokens = candidate.split(/\s+/);

  if (tokens.length === 0 || tokens.length > 4) {
    return false;
  }

  const structure = parseIngredientStructure(tokens);

  if (structure.quantity !== null || structure.unit) {
    return false;
  }

  const nextIngredientLikeLines = cleanedLines
    .slice(index + 1, index + 4)
    .filter((nextLine) => looksLikeIngredientContent(nextLine));

  if (nextIngredientLikeLines.length === 0) {
    return false;
  }

  if (domLineSet.has(line)) {
    return false;
  }

  if (line.endsWith(":")) {
    return startsWithUppercase(candidate);
  }

  if (
    tokens.length === 1 &&
    startsWithUppercase(candidate) &&
    nextIngredientLikeLines.length >= 2
  ) {
    return true;
  }

  return (
    (hasReliableDomSignal || tokens.length > 1) &&
    nextIngredientLikeLines.length >= 2 &&
    looksLikeSectionLabel(candidate)
  );
};

const stripTrailingHeaderPunctuation = (line: string) =>
  line.replace(/:+$/, "").trim();

const looksLikeIngredientContent = (line: string) => {
  const cleanedLine = cleanIngredientLine(line);

  if (!cleanedLine) {
    return false;
  }

  const tokens = cleanedLine.split(/\s+/);
  const structure = parseIngredientStructure(tokens);

  return (
    structure.quantity !== null ||
    structure.unit.length > 0 ||
    startsWithLowercase(cleanedLine) ||
    /[(),]/.test(cleanedLine)
  );
};

const looksLikeSectionLabel = (line: string) => {
  const tokens = line.split(/\s+/);
  const firstToken = tokens[0] ?? "";

  if (!startsWithUppercase(firstToken)) {
    return false;
  }

  return tokens
    .slice(1)
    .every((token) => startsWithUppercase(token) || startsWithLowercase(token));
};

const normalizeWhitespace = (value: string | null | undefined) => {
  return value?.trim().replace(/\s+/g, " ") ?? "";
};

const parseIngredientStructure = (
  tokens: string[],
): IngredientLineStructure => {
  const quantityResult = parseLeadingQuantity(tokens);
  let quantity: number | null = null;
  let index = 0;

  if (quantityResult) {
    quantity = quantityResult.quantity;
    index = quantityResult.tokensConsumed;
  }

  let unit = "";

  if (quantity !== null && index < tokens.length && isKnownUnit(tokens[index])) {
    unit = normalizeUnit(tokens[index]);
    index += 1;
  }

  return {
    quantity,
    unit,
    nameStartIndex: index,
  };
};

const parseLeadingQuantity = (tokens: string[]): QuantityParseResult | null => {
  if (tokens.length === 0) {
    return null;
  }

  if (
    tokens.length >= 2 &&
    isWholeNumber(tokens[0]) &&
    isFractionToken(tokens[1])
  ) {
    const wholeNumber = parseSingleQuantity(tokens[0]);
    const fraction = parseSingleQuantity(tokens[1]);

    if (wholeNumber !== null && fraction !== null) {
      return {
        quantity: wholeNumber + fraction,
        tokensConsumed: 2,
      };
    }
  }

  const quantity = parseSingleQuantity(tokens[0]);

  if (quantity === null) {
    return null;
  }

  return {
    quantity,
    tokensConsumed: 1,
  };
};

const parseSingleQuantity = (token: string) => {
  const normalizedToken = normalizeNumericToken(token);

  if (!normalizedToken) {
    return null;
  }

  if (UNICODE_FRACTIONS.has(normalizedToken)) {
    return UNICODE_FRACTIONS.get(normalizedToken) ?? null;
  }

  if (/^\d+\/\d+$/.test(normalizedToken)) {
    const [numerator, denominator] = normalizedToken.split("/").map(Number);

    if (!denominator) {
      return null;
    }

    return numerator / denominator;
  }

  if (/^\d+(?:\.\d+)?$/.test(normalizedToken)) {
    return Number(normalizedToken);
  }

  return null;
};

const normalizeNumericToken = (token: string) => {
  return token
    .toLowerCase()
    .replace(",", ".")
    .replace(/^[\(\[]+/, "")
    .replace(/[\),.;:]+$/, "");
};

const isWholeNumber = (token: string) => {
  return /^\d+$/.test(normalizeNumericToken(token));
};

const isFractionToken = (token: string) => {
  const normalizedToken = normalizeNumericToken(token);

  return (
    /^\d+\/\d+$/.test(normalizedToken) ||
    UNICODE_FRACTIONS.has(normalizedToken)
  );
};

const isKnownUnit = (token: string) => {
  return KNOWN_UNITS.has(normalizeUnit(token));
};

const getFirstCharacter = (value: string) => {
  return Array.from(value.trim())[0];
};

const startsWithUppercase = (value: string) => {
  const firstCharacter = getFirstCharacter(value);

  if (!firstCharacter) {
    return false;
  }

  return (
    firstCharacter === firstCharacter.toLocaleUpperCase("sv-SE") &&
    firstCharacter !== firstCharacter.toLocaleLowerCase("sv-SE")
  );
};

const startsWithLowercase = (value: string) => {
  const firstCharacter = getFirstCharacter(value);

  if (!firstCharacter) {
    return false;
  }

  return (
    firstCharacter === firstCharacter.toLocaleLowerCase("sv-SE") &&
    firstCharacter !== firstCharacter.toLocaleUpperCase("sv-SE")
  );
};

const normalizeUnit = (token: string) => {
  return token
    .toLowerCase()
    .replace(/^[^a-z\u00e5\u00e4\u00f6]+/i, "")
    .replace(/[^a-z\u00e5\u00e4\u00f6]+$/i, "");
};

const joinTokens = (tokens: string[], startIndex: number) => {
  if (startIndex >= tokens.length) {
    return "";
  }

  return tokens.slice(startIndex).join(" ").trim();
};
