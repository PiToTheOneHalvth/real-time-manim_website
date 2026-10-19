---
title: Markdown feature test
tags: [test, markdown, renderer]
---

# Markdown feature test

A single note exercising every markdown feature the wiki renderer supports: frontmatter, headings, emphasis, rules, quotes, lists, tasks, tables, code, links and images. Paragraphs join across line breaks — this line and the next
collapse into one paragraph with **bold**, __bold underscores__, *italic*, _italic underscores_, and `inline code`.

## Headings

### Level three

#### Level four

##### Level five

###### Level six

## Emphasis

**bold with asterisks**, __bold with underscores__, *italic with asterisks*, _italic with underscores_, and `inline code` mixed with **bold** and *italic*.

## Horizontal rules

Three equivalent forms:

---

***

___

## Blockquotes

> A blockquote paragraph with **bold** and `code`.
>
> A second paragraph in the same quote.
> > A nested quote.

## Unordered lists

- alpha
- beta
* gamma
+ delta

## Ordered lists

1. first
2. second
3. third

## Task lists

- [x] done
- [X] also done (uppercase X)
- [ ] open

## Tables

| Name | Value | Alignment |
| --- | ---: | :---: |
| alpha | 1 | left |
| beta | 2 | right |
| gamma | 3 | center |

## Code blocks

Fenced with a language:

```python
def seek(t):
    name = "frame"  # a string
    scale = 1.5
    return frame_at(t)  # pure function of alpha
```

Plain fence:

```
no language tag
```

## Links

- external: [GitHub](https://github.com)
- mailto: [send mail](mailto:someone@example.com)
- internal markdown link: [back to index](index.md)

## Images

![alt text shown in place of the image](https://example.com/picture.png)
