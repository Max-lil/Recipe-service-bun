import { load } from "cheerio/lib/slim";
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
  "kryddmått",
  "styck",
  "stck",
  "stycken",
  "nypa",
  "nypor",
]);

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
  ["½", 0.5],
  ["⅓", 1 / 3],
  ["⅔", 2 / 3],
  ["¼", 0.25],
  ["¾", 0.75],
  ["⅛", 0.125],
  ["⅜", 0.375],
  ["⅝", 0.625],
  ["⅞", 0.875],
]);

const DOM_INGREDIENT_SELECTORS = [
  '[itemprop="recipeIngredient"]',
  ".ingredients li",
  ".recipe-ingredients li",
  ".ingredients-list li",
];

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
) => {
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

  return response.text();
};

export const extractScrapedRecipeFromHtml = (html: string): ScrapedRecipe => {
  const jsonLdRecipe = extractRecipeFromJsonLd(html);
  const domIngredientLines = extractRecipeFromDom(html);
  const ingredientLines =
    jsonLdRecipe.ingredients.length > 0
      ? jsonLdRecipe.ingredients
      : domIngredientLines;
  const normalizedLines = normalizeIngredientLines(ingredientLines, {
    domLines: jsonLdRecipe.ingredients.length > 0 ? domIngredientLines : undefined,
  });

  if (normalizedLines.length === 0) {
    throw new RecipeScrapeError(
      422,
      "No ingredients could be extracted from the recipe page",
    );
  }

  return {
    title: jsonLdRecipe.title ?? extractPageTitle(html),
    ingredientsRaw: normalizedLines.join("\n"),
    ingredients: normalizedLines.map((line) => parseIngredientLine(line)),
  };
};

export const extractRecipeFromJsonLd = (html: string): JsonLdRecipeData => {
  const $ = load(html);
  let title: string | null = null;
  const ingredients = new Set<string>();

  $('script[type="application/ld+json"]').each((_, element) => {
    const rawJson = $(element).html();
    if (!rawJson) {
      return;
    }

    try {
      const parsed = JSON.parse(rawJson);
      const candidates = collectJsonLdObjects(parsed);

      for (const candidate of candidates) {
        if (!isRecipeNode(candidate)) {
          continue;
        }

        if (!title) {
          title = getTextValue(candidate.name);
        }

        const recipeIngredients = Array.isArray(candidate.recipeIngredient)
          ? candidate.recipeIngredient
          : [];

        for (const ingredient of recipeIngredients) {
          const line = getTextValue(ingredient);
          if (line) {
            ingredients.add(line);
          }
        }
      }
    } catch {
      return;
    }
  });

  return {
    title,
    ingredients: Array.from(ingredients),
  };
};

export const extractRecipeFromDom = (html: string) => {
  const $ = load(html);
  const ingredients = new Set<string>();

  for (const selector of DOM_INGREDIENT_SELECTORS) {
    $(selector).each((_, element) => {
      const line = normalizeWhitespace($(element).text());
      if (line) {
        ingredients.add(line);
      }
    });

    if (ingredients.size > 0) {
      break;
    }
  }

  return Array.from(ingredients);
};

export const normalizeIngredientLines = (
  lines: string[],
  options: NormalizeIngredientLineOptions = {},
) => {
  const cleanedLines = lines
    .map((line) => cleanIngredientLine(line))
    .filter((line) => Boolean(line));
  const normalizedLines = new Set<string>();
  const cleanedDomLines = (options.domLines ?? [])
    .map((line) => cleanIngredientLine(line))
    .filter((line) => Boolean(line));
  const domLineSet = new Set(cleanedDomLines);
  const domOverlapCount = cleanedLines.filter((line) => domLineSet.has(line)).length;
  const hasReliableDomSignal =
    cleanedDomLines.length > 0 && domOverlapCount / cleanedDomLines.length >= 0.5;

  cleanedLines.forEach((cleanedLine, index) => {
    if (
      !isIngredientSectionHeader(
        cleanedLine,
        cleanedLines,
        index,
        domLineSet,
        hasReliableDomSignal,
      )
    ) {
      normalizedLines.add(cleanedLine);
    }
  });

  return Array.from(normalizedLines);
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
  const name = joinTokens(tokens, structure.nameStartIndex) || cleanedLine;

  return {
    name,
    quantity: structure.quantity,
    unit: structure.unit,
    rawText: cleanedLine,
  };
};

const extractPageTitle = (html: string) => {
  const $ = load(html);
  return normalizeWhitespace($("title").first().text()) || null;
};

const collectJsonLdObjects = (value: unknown) => {
  const objects: Record<string, any>[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      objects.push(...collectJsonLdObjects(item));
    }
    return objects;
  }

  if (!value || typeof value !== "object") {
    return objects;
  }

  const objectValue = value as Record<string, any>;
  objects.push(objectValue);

  if (Array.isArray(objectValue["@graph"])) {
    for (const graphNode of objectValue["@graph"]) {
      objects.push(...collectJsonLdObjects(graphNode));
    }
  }

  return objects;
};

const isRecipeNode = (value: Record<string, any>) => {
  const typeValue = value["@type"];
  if (typeof typeValue === "string") {
    return typeValue.toLowerCase().includes("recipe");
  }

  if (Array.isArray(typeValue)) {
    return typeValue.some(
      (entry) =>
        typeof entry === "string" && entry.toLowerCase().includes("recipe"),
    );
  }

  return false;
};

const getTextValue = (value: unknown) => {
  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (typeof objectValue.text === "string") {
      return normalizeWhitespace(objectValue.text);
    }
    if (typeof objectValue.name === "string") {
      return normalizeWhitespace(objectValue.name);
    }
  }

  return "";
};

const cleanIngredientLine = (line: string) => {
  return normalizeWhitespace(line).replace(/^[\-\*\u2022\s]+/, "").trim();
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
  if (!startsWithUppercase(tokens[0] ?? "")) {
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

  if (tokens.length >= 2 && isWholeNumber(tokens[0]) && isFractionToken(tokens[1])) {
    const first = parseSingleQuantity(tokens[0]);
    const second = parseSingleQuantity(tokens[1]);

    if (first !== null && second !== null) {
      return {
        quantity: first + second,
        tokensConsumed: 2,
      };
    }
  }

  const first = parseSingleQuantity(tokens[0]);
  if (first === null) {
    return null;
  }

  return {
    quantity: first,
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

const isWholeNumber = (token: string) => /^\d+$/.test(normalizeNumericToken(token));

const isFractionToken = (token: string) => {
  const normalizedToken = normalizeNumericToken(token);
  return /^\d+\/\d+$/.test(normalizedToken) || UNICODE_FRACTIONS.has(normalizedToken);
};

const isKnownUnit = (token: string) => KNOWN_UNITS.has(normalizeUnit(token));

const startsWithUppercase = (value: string) => {
  const firstCharacter = Array.from(value.trim())[0];
  if (!firstCharacter) {
    return false;
  }

  return (
    firstCharacter === firstCharacter.toLocaleUpperCase("sv-SE") &&
    firstCharacter !== firstCharacter.toLocaleLowerCase("sv-SE")
  );
};

const startsWithLowercase = (value: string) => {
  const firstCharacter = Array.from(value.trim())[0];
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
    .replace(/^[^a-z]+/, "")
    .replace(/[^a-z]+$/, "");
};

const joinTokens = (tokens: string[], startIndex: number) => {
  if (startIndex >= tokens.length) {
    return "";
  }

  return tokens.slice(startIndex).join(" ").trim();
};
