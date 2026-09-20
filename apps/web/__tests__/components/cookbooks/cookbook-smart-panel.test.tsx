/**
 * How the smart collection panel takes a tag you type in.
 *
 * The tag search box is a filter, but it commits the writer too: writing a
 * tag's exact name and pressing Enter selects it, exactly as clicking the
 * suggestion would — so a collection can be built by typing, one tag at a
 * time, without ever touching the chip cloud.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CookbookRuleDTO, CookbookSummaryDTO } from "@norish/shared/contracts";

const { tagsRef } = vi.hoisted(() => ({
  tagsRef: { value: [] as Array<{ id: string; name: string }> },
}));

vi.mock("@/components/Panel/Panel", () => {
  const PanelMock = ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null;

  PanelMock.Body = ({ children }: { children: React.ReactNode }) => <>{children}</>;

  PanelMock.Footer = ({ children }: { children: React.ReactNode }) => <>{children}</>;

  return { default: PanelMock };
});

vi.mock("@/components/shared/action-button", () => ({
  ActionButton: ({ onPress, isDisabled, children }: any) => (
    <button data-testid="save" disabled={isDisabled} type="button" onClick={onPress}>
      {children}
    </button>
  ),
  ActionButtonGroup: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/skeleton/chip-skeleton", () => ({ default: () => null }));

vi.mock("@/hooks/config", () => ({
  useTagCatalogQuery: () => ({ tags: tagsRef.value, isLoading: false }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@heroui/react", () => ({
  Chip: ({ children, color, onClick }: any) => (
    <button data-active={color === "accent"} type="button" onClick={onClick}>
      {children}
    </button>
  ),
  Button: ({ children, onPress, ...props }: any) => (
    <button type="button" onClick={onPress} {...props}>
      {children}
    </button>
  ),
  Input: (props: any) => <input {...props} />,
  Label: ({ children }: any) => <label>{children}</label>,
}));

import { SmartCookbookPanel } from "@/components/cookbooks/cookbook-smart-panel";

function cookbook(overrides: Partial<CookbookSummaryDTO> = {}): CookbookSummaryDTO {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "reader",
    title: "Weeknights",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    version: 1,
    memberCount: 0,
    coverImages: [],
    memberTitles: [],
    memberTags: [],
    totalMinutes: null,
    minServings: null,
    rule: { kind: "manual" },
    ...overrides,
  };
}

function renderCreate() {
  const onCreate = vi.fn();
  const onOpenChange = vi.fn();

  render(
    <SmartCookbookPanel open onCreate={onCreate} onOpenChange={onOpenChange} />
  );

  return { onCreate, onOpenChange };
}

describe("SmartCookbookPanel tag input", () => {
  beforeEach(() => {
    tagsRef.value = [
      { id: "t1", name: "Vegetarian" },
      { id: "t2", name: "Vegan" },
    ];
  });

  it("selects a tag written in full followed by Enter", () => {
    const { onCreate } = renderCreate();

    fireEvent.change(screen.getByPlaceholderText("searchTags"), {
      target: { value: "Vegetarian" },
    });
    // The filter narrows the cloud to the exact suggestion.
    expect(screen.getAllByText("Vegetarian").length).toBeGreaterThan(0);
    fireEvent.keyDown(screen.getByPlaceholderText("searchTags"), { key: "Enter" });

    // The chip now reads as selected.
    expect(screen.getByText("Vegetarian").dataset.active).toBe("true");
    // The field cleared so the next tag can be written.
    expect((screen.getByPlaceholderText("searchTags") as HTMLInputElement).value).toBe("");

    fireEvent.change(screen.getByTestId("cookbook-title-input"), {
      target: { value: "Plant nights" },
    });
    fireEvent.click(screen.getByTestId("save"));

    expect(onCreate).toHaveBeenCalledWith({
      title: "Plant nights",
      rule: { kind: "tags", tagIds: ["t1"], matchMode: "OR" },
    });
  });

  it("ignores Enter when the typed name matches no tag", () => {
    const { onCreate } = renderCreate();

    fireEvent.change(screen.getByPlaceholderText("searchTags"), {
      target: { value: "Not a tag" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("searchTags"), { key: "Enter" });

    // The cloud cleared to the empty hint; nothing was selected.
    expect(screen.getByText("emptyTags")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("cookbook-title-input"), {
      target: { value: "Weeknights" },
    });
    fireEvent.click(screen.getByTestId("save"));

    // Nothing was picked, so the collection is a plain one.
    expect(onCreate).toHaveBeenCalledWith({ title: "Weeknights", rule: null });
  });

  it("lets a plain cookbook gain a rule when edited", () => {
    const onUpdateRule = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <SmartCookbookPanel
        cookbook={cookbook()}
        open
        onOpenChange={onOpenChange}
        onUpdateRule={onUpdateRule}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("searchTags"), {
      target: { value: "Vegan" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("searchTags"), { key: "Enter" });
    fireEvent.click(screen.getByTestId("save"));

    expect(onUpdateRule).toHaveBeenCalledWith({
      kind: "tags",
      tagIds: ["t2"],
      matchMode: "OR",
    } satisfies CookbookRuleDTO);
  });
});