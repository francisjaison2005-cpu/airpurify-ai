import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

describe("AirPurify AI Streamlined Single Dashboard Routing", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  it("matches the main Home Dashboard route for /", () => {
    const matches = router.matchRoutes("/");
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    expect(matches.at(-1)?.pathname).toBe("/");
  });

  const removedFeatureRoutes = [
    "/analysis",
    "/indoor-outdoor",
    "/forecast",
    "/testing",
    "/history",
    "/alerts",
    "/profile",
    "/settings",
    "/help",
    "/compare",
    "/devices",
    "/live",
    "/map",
  ];

  removedFeatureRoutes.forEach((path) => {
    it(`does not match removed route ${path}`, () => {
      const matches = router.matchRoutes(path);
      const lastMatch = matches.at(-1);
      expect(lastMatch?.routeId === rootRouteId || lastMatch === undefined).toBe(true);
    });
  });
});

