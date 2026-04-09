import { describe, expect, test } from "bun:test";
import { recipeCreateSchema, recipeScrapeRequestSchema } from "./recipe-model";

describe("recipe create schema", () => {
  test("accepts a valid http url", () => {
    expect(
      recipeCreateSchema.parse({
        title: "Tomato Soup",
        url: "http://example.com/recipe",
      }),
    ).toEqual({
      title: "Tomato Soup",
      url: "http://example.com/recipe",
    });
  });

  test("accepts a valid https url", () => {
    expect(
      recipeCreateSchema.parse({
        title: "Tomato Soup",
        url: "https://example.com/recipe",
      }),
    ).toEqual({
      title: "Tomato Soup",
      url: "https://example.com/recipe",
    });
  });

  test("stores omitted url as null", () => {
    expect(
      recipeCreateSchema.parse({
        title: "Tomato Soup",
      }),
    ).toEqual({
      title: "Tomato Soup",
      url: null,
    });
  });

  test("stores null url as null", () => {
    expect(
      recipeCreateSchema.parse({
        title: "Tomato Soup",
        url: null,
      }),
    ).toEqual({
      title: "Tomato Soup",
      url: null,
    });
  });

  test("stores empty url as null", () => {
    expect(
      recipeCreateSchema.parse({
        title: "Tomato Soup",
        url: "",
      }),
    ).toEqual({
      title: "Tomato Soup",
      url: null,
    });
  });

  test("stores whitespace-only url as null", () => {
    expect(
      recipeCreateSchema.parse({
        title: "Tomato Soup",
        url: "   ",
      }),
    ).toEqual({
      title: "Tomato Soup",
      url: null,
    });
  });

  test("rejects invalid non-empty urls", () => {
    expect(() =>
      recipeCreateSchema.parse({
        title: "Tomato Soup",
        url: "not a valid url",
      }),
    ).toThrow();
  });

  test("rejects non-http urls", () => {
    expect(() =>
      recipeCreateSchema.parse({
        title: "Tomato Soup",
        url: "ftp://example.com/recipe",
      }),
    ).toThrow("URL must start with http:// or https://");
  });

  test("requires url for scrape requests", () => {
    expect(() =>
      recipeScrapeRequestSchema.parse({
        title: "Tomato Soup",
      }),
    ).toThrow();
  });
});
