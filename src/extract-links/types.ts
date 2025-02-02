import { FrameElement } from '../types/util'
import { Resource, DomResource } from '../types/resource' // TODO Remove need for this (recursive) import
import { SubresourceType } from './url-attributes/types'

// This alias is used to explicitly state which strings are guaranteed/presumed to be absolute URLs.
export type UrlString = string

export type Link = NonSubresourceLink | SubresourceLink

interface Link_base {
    // The link's target URL. This is the exact value as it appears in the document, and may thus be
    // a relative URL. This property can be written to, which will modify the document.
    target: string;

    // The link's target URL as an absolute URL. This takes into account factors like the <base
    // href="..."> tag, so usually you may prefer to use `absoluteTarget` rather than `target`.
    // If the target is not a valid (relative) URL, absoluteTarget equals undefined.
    readonly absoluteTarget?: UrlString;

    // A boolean indicating whether the resource being linked to is normally considered a
    // subresource of the document. For example, the `src` of an `<img>` tag specifies a subresource
    // because the image is considered *part of* the document, while the `href` of an `<a>` or the
    // `action` of a `<form>` merely *point to* another resource.
    readonly isSubresource: boolean;

    // Information needed to find the link in the DOM or stylesheet, for scenarios where one needs
    // to do more than just reading or modifying the link target.
    readonly from: Anchor;
}

// Links that refer to resources without making them ‘part of’ the document.
// Note the WHATWG HTML spec calls such (and *only* such) links ‘hyperlinks’ <https://html.spec.whatwg.org/multipage/links.html#hyperlink>
export interface NonSubresourceLink extends Link_base {
    readonly isSubresource: false;
    readonly subresourceType: undefined;
}

// Links that make their targets ‘part of’ the document.
export interface SubresourceLink extends Link_base {
    readonly isSubresource: true;

    // Indicates the type of resource (`image`, `style`, ...). This corresponds to what is now
    // called the 'destination' in the WHATWG fetch spec. See <https://fetch.spec.whatwg.org/#concept-request-destination>
    readonly subresourceType?: SubresourceType;

    // If the subresource is available, it can be assigned to this attribute.
    // TODO Remove this ‘upward’ dependency.
    resource?: Resource;
}


export interface Anchor {
}

export interface AttributeAnchor<E extends Element, A extends string> extends Anchor {
    element: E;
    attribute: A;
    // Range is kept optional while it is not yet implemented for the 'style' attribute (it depends
    // on CssAnchor.range)
    rangeWithinAttribute?: [number, number];
}

export interface TextContentAnchor<E extends Element> extends Anchor {
    element: E;
    // Range is kept optional because not yet implemented (it depends on CssAnchor.range)
    rangeWithinTextContent?: [number, number];
}

export interface CssAnchor extends Anchor {
    // The character position of the URL inside the stylesheet text.
    range?: [number, number]; // optional because not yet implemented
}


// A link defined in an HTML document.
export type HtmlLink = HtmlNonSubresourceLink | HtmlSubresourceLink

interface HtmlLink_base extends Link_base {
    readonly from: AttributeAnchor<any, any> | TextContentAnchor<any>;
}

export type HtmlNonSubresourceLink = HtmlLink_base & NonSubresourceLink

export type HtmlSubresourceLink =
    | HtmlUntypedLink
    | HtmlAudioLink
    | HtmlDocumentLink
    | HtmlEmbedLink
    | HtmlFontLink
    | HtmlImageLink
    | HtmlObjectLink
    | HtmlScriptLink
    | HtmlStyleLink
    | HtmlTrackLink
    | HtmlVideoLink

type HtmlSubresourceLink_base = HtmlLink_base & SubresourceLink

export interface HtmlUntypedLink extends HtmlSubresourceLink_base {
    readonly subresourceType: undefined;
}

export interface HtmlAudioLink extends HtmlSubresourceLink_base {
    readonly subresourceType: "audio";
    readonly from: AttributeAnchor<HTMLAudioElement | HTMLSourceElement, "src">;
}

export interface HtmlDocumentLink extends HtmlSubresourceLink_base {
    readonly subresourceType: "document";
    readonly from: AttributeAnchor<FrameElement, "src">;
    resource?: DomResource;
}

export interface HtmlEmbedLink extends HtmlSubresourceLink_base {
    readonly subresourceType: "embed";
    readonly from: AttributeAnchor<HTMLEmbedElement, "embed">;
}

export interface HtmlFontLink extends HtmlSubresourceLink_base {
    readonly subresourceType: "font";
    readonly from: TextContentAnchor<HTMLStyleElement>;
}

export interface HtmlImageLink extends HtmlSubresourceLink_base {
    readonly subresourceType: "image";
    readonly from:
        | AttributeAnchor<HTMLBodyElement, "background">
        | AttributeAnchor<HTMLLinkElement, "href">
        | AttributeAnchor<HTMLImageElement | HTMLInputElement, "src">
        | AttributeAnchor<HTMLVideoElement, "poster">
        | AttributeAnchor<HTMLImageElement | HTMLSourceElement, "srcset">
        | TextContentAnchor<HTMLStyleElement>
        | AttributeAnchor<HTMLElement, "style">
        ;
}

export interface HtmlObjectLink extends HtmlSubresourceLink_base {
    readonly subresourceType: "object";
    readonly from: AttributeAnchor<HTMLObjectElement, "data">;
}

export interface HtmlScriptLink extends HtmlSubresourceLink_base {
    readonly subresourceType: "script";
    readonly from: AttributeAnchor<HTMLScriptElement, "src">;
}

export interface HtmlStyleLink extends HtmlSubresourceLink_base {
    readonly subresourceType: "style";
    readonly from:
        | AttributeAnchor<HTMLLinkElement, "href">
        | TextContentAnchor<HTMLStyleElement>
        ;
}

export interface HtmlTrackLink extends HtmlSubresourceLink_base {
    readonly subresourceType: "track";
    readonly from: AttributeAnchor<HTMLTrackElement, "src">;
}

export interface HtmlVideoLink extends HtmlSubresourceLink_base {
    readonly subresourceType: "video";
    readonly from:
        | AttributeAnchor<HTMLSourceElement, "src">
        | AttributeAnchor<HTMLVideoElement, "src">
        ;
}

export type HtmlAttributeDefinedLink = HtmlLink & { from: AttributeAnchor<any, any> }


export type CssLink = CssSubresourceLink // (all links in CSS define subresources)

interface CssLink_base extends Link_base {
    readonly from: CssAnchor;
}

type CssSubresourceLink = CssFontLink | CssImageLink | CssStyleLink

type CssSubresourceLink_base = CssLink_base & SubresourceLink

export interface CssFontLink extends CssSubresourceLink_base {
    readonly subresourceType: "font";
}

export interface CssImageLink extends CssSubresourceLink_base {
    readonly subresourceType: "image";
}

export interface CssStyleLink extends CssSubresourceLink_base {
    readonly subresourceType: "style";
}
