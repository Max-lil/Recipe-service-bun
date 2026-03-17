import { describe, expect, test } from "bun:test";
import {
  extractRecipeFromDom,
  extractRecipeFromJsonLd,
  extractScrapedRecipeFromHtml,
  normalizeIngredientLines,
  parseIngredientLine,
  RecipeScrapeError,
} from "./recipe-scraper";

describe("recipe scraper", () => {
  test("extracts recipe ingredients from json-ld", () => {
    const html = `
      <html>
        <head>
          <title>Fallback title</title>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Recipe",
              "name": "Tomato Soup",
              "recipeIngredient": ["2 dl milk", "1 tsp salt"]
            }
          </script>
        </head>
      </html>
    `;

    const result = extractRecipeFromJsonLd(html);

    expect(result.title).toBe("Tomato Soup");
    expect(result.ingredients).toEqual(["2 dl milk", "1 tsk salt"]);
  });

  test("extracts recipe ingredients from json-ld graph", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@graph": [
            {
              "@type": "BreadcrumbList",
              "name": "Breadcrumbs"
            },
            {
              "@type": ["Thing", "Recipe"],
              "name": "Graph Recipe",
              "recipeIngredient": ["1 onion", "2 tbsp oil"]
            }
          ]
        }
      </script>
    `;

    const result = extractRecipeFromJsonLd(html);

    expect(result.title).toBe("Graph Recipe");
    expect(result.ingredients).toEqual(["1 onion", "2 msk oil"]);
  });

  test("falls back to dom selectors", () => {
    const html = `
      <div class="ingredients">
        <ul>
          <li>2 dl milk</li>
          <li>salt</li>
        </ul>
      </div>
    `;

    expect(extractRecipeFromDom(html)).toEqual(["2 dl milk", "salt"]);
  });

  test("normalizes ingredient lines", () => {
    const lines = ["  - 2 dl milk  ", "", "salt", "2 dl milk"];

    expect(normalizeIngredientLines(lines)).toEqual(["2 dl milk", "salt"]);
  });

  test("parses quantity, unit and name", () => {
    expect(parseIngredientLine("2 dl milk")).toEqual({
      name: "milk",
      quantity: 2,
      unit: "dl",
      rawText: "2 dl milk",
    });

    expect(parseIngredientLine("1 1/2 msk sugar")).toEqual({
      name: "sugar",
      quantity: 1.5,
      unit: "msk",
      rawText: "1 1/2 msk sugar",
    });

    expect(parseIngredientLine("1/2 onion")).toEqual({
      name: "onion",
      quantity: 0.5,
      unit: "",
      rawText: "1/2 onion",
    });

    expect(parseIngredientLine("salt")).toEqual({
      name: "salt",
      quantity: null,
      unit: "",
      rawText: "salt",
    });
  });

  test("prefers json-ld and returns cleaned ingredient data", () => {
    const html = `
      <html>
        <head>
          <title>Page Title</title>
          <script type="application/ld+json">
            {
              "@type": "Recipe",
              "name": "Recipe Title",
              "recipeIngredient": ["2 dl milk", "salt"]
            }
          </script>
        </head>
        <body>
          <div class="ingredients">
            <li>should not be used</li>
          </div>
        </body>
      </html>
    `;

    const result = extractScrapedRecipeFromHtml(html);

    expect(result.title).toBe("Recipe Title");
    expect(result.ingredientsRaw).toBe("2 dl milk\nsalt");
    expect(result.ingredients).toEqual([
      {
        name: "milk",
        quantity: 2,
        unit: "dl",
        rawText: "2 dl milk",
      },
      {
        name: "salt",
        quantity: null,
        unit: "",
        rawText: "salt",
      },
    ]);
  });

  test("throws when no ingredients can be extracted", () => {
    expect(() => extractScrapedRecipeFromHtml("<html><title>Nope</title></html>")).toThrow(
      new RecipeScrapeError(
        422,
        "No ingredients could be extracted from the recipe page",
      ),
    );
  });
});
