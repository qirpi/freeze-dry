import fs from 'fs'
import jsdom from 'jsdom'
import jestFetchMock from 'jest-fetch-mock' // magically polyfills Response, Request, ...
import { dataURLToBlob } from 'blob-util'

import freezeDry from '../src/index'

const fetch = jestFetchMock
Object.assign(global, { fetch })
beforeEach(() => {
    fetch.mockImplementation(mockFetch)
})

jest.useFakeTimers()

test('should freeze-dry an example page as expected', async () => {
    const doc = await getExampleDoc()

    // Run freeze-dry, while passing a fixed date for reproducability.
    const result = await freezeDry(doc, { now: new Date(1534615340948) })

    expect(result).toMatchSnapshot() // compares to (or creates) snapshot in __snapshots__ folder
})

test('should capture current state of documents inside frames', async () => {
    const doc = await getExampleDoc()

    // Modify the iframe contents; the capture should include the modifications.
    const innerDoc = doc.getElementsByTagName('iframe')[0].contentDocument
    innerDoc.body.appendChild(innerDoc.createElement('hr'))

    const result = await freezeDry(doc, { now: new Date(1534615340948) })

    const dryDoc = await makeDom(result)
    const dryInnerDoc = dryDoc.querySelector('iframe').contentDocument
    expect(dryInnerDoc.querySelector('hr')).not.toBeNull()
})

test('should be idempotent', async () => {
    const doc = await getExampleDoc()
    const dryHtml = await freezeDry(doc, { now: new Date(1534615340948) })
    const docUrl = 'https://url.should.be/irrelevant'
    const dryDoc = await makeDom(dryHtml, docUrl)

    // Freeze-dry the freeze-dried page. Adding metadata would of course break idempotency.
    const extraDryHtml = await freezeDry(dryDoc, { addMetadata: false })

    expect(extraDryHtml).toEqual(dryHtml)
})

test('should return the incomplete result after given timeout', async () => {
    const doc = await getExampleDoc()

    // Make fetch never resolve
    fetch.mockImplementation(url => new Promise(resolve => {}))

    const resultP = freezeDry(doc, {
        now: new Date(1534615340948),
        timeout: 2000,
    })
    jest.runAllTimers() // trigger the timeout directly.
    const result = await resultP

    expect(result).toMatchSnapshot()
})

test('should use the given docUrl', async () => {
    const docUrl = 'https://example.com/main/page.html'
    const docHtml = await (await fetch(docUrl)).text()
    // This time, we use a DOMParser, and create a Document that lacks a URL.
    const doc = new DOMParser().parseFromString(docHtml, 'text/html')

    const result = await freezeDry(doc, { docUrl })

    const dryDoc = await makeDom(result)
    expect(dryDoc.querySelector('a').getAttribute('href'))
        .toEqual('https://example.com/main/something')
    expect(dryDoc.querySelector('img').getAttribute('src'))
        .toMatch(/^data:/)
})

test('should respect the addMetadata option', async () => {
    const testWithOption = async (addMetadata?) => {
        const doc = await getExampleDoc()

        const result = await freezeDry(doc, { addMetadata })

        const dryDoc = await makeDom(result)
        expect(dryDoc.querySelector('link[rel=original]')).not.toBeNull()
        expect(dryDoc.querySelector('meta[http-equiv=Memento-Datetime]')).not.toBeNull()
    }
    await expect(testWithOption(true)).resolves.toEqual(undefined)
    await expect(testWithOption(false)).rejects.toEqual(expect.anything())
    await expect(testWithOption()).resolves.toEqual(undefined) // option should default to true
})

test('should respect the keepOriginalAttributes option', async () => {
    const testWithOption = async (keepOriginalAttributes?) => {
        const doc = await getExampleDoc()

        const result = await freezeDry(doc, { keepOriginalAttributes })

        const dryDoc = await makeDom(result)
        expect(dryDoc.querySelector('img[data-original-src]')).not.toBeNull()
    }
    await expect(testWithOption(true)).resolves.toEqual(undefined)
    await expect(testWithOption(false)).rejects.toEqual(expect.anything())
    await expect(testWithOption()).resolves.toEqual(undefined) // option should default to true
})

test('should use the custom fetchResource function', async () => {
    const now = new Date(1545671350764)
    const doc = await getExampleDoc()
    const expectedResult = await freezeDry(doc, { now })

    fetch.mockClear() // Clear the invocation count.
    const fetchResource = jest.fn(mockFetch) // Create a second mock using the same implementation.

    const result = await freezeDry(doc, { now, fetchResource })

    // We should have got the same result as usual, without the global fetch having been invoked.
    expect(result).toEqual(expectedResult)
    expect(fetchResource).toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
})

test('should work if the custom fetchResource function returns a simple object', async () => {
    const now = new Date(1545671350764)
    const doc = await getExampleDoc()
    const expectedResult = await freezeDry(doc, { now })

    // A fetch-like function, that returns not a Response but a plain object with a blob and a url.
    async function fetchResource(...args) {
        const response = await fetch(...args)
        return {
            url: response.url,
            blob: await response.blob(),
        }
    }

    const result = await freezeDry(doc, { now, fetchResource })

    expect(result).toEqual(expectedResult)
})

test('should use interfaces of a custom global object', async () => {
    const now = new Date(1545671350764)
    const doc = await getExampleDoc()
    const expectedResult = await freezeDry(doc, { now })

    // Create a clone of the window object, replacing some function freezeDry will invoke.
    const glob = Object.create(doc.defaultView)
    glob.btoa = jest.fn(glob.btoa)

    const result = await freezeDry(doc, { now, glob })
    expect(result).toEqual(expectedResult)
    expect(glob.btoa).toHaveBeenCalled()
})

async function getExampleDoc(): Promise<Document> {
    const docUrl = 'https://example.com/main/page.html'
    const docHtml = await (await fetch(docUrl)).text()
    const doc = await makeDom(docHtml, docUrl)
    return doc
}

async function makeDom(docHtml: string, docUrl: string = undefined): Promise<Document> {
    const dom = new jsdom.JSDOM(docHtml, {
        url: docUrl,
        resources: new MockResourceLoader(),
    })

    // Make code ‘inside’ jsdom use these ‘outside’ implementations to simplify their interaction.
    // (note we could probably enable mockFetch to use ‘inside’ implementations instead, but at
    // time of writing jsdom lacks an implementation of Response)
    dom.window.fetch = fetch
    dom.window.Blob = Blob
    dom.window.FileReader = FileReader

    const doc = dom.window.document

    // Wait until JSDOM has completed loading the page (including frames).
    await new Promise(resolve => {
        if (doc.readyState === 'complete') {
            resolve()
        } else {
            doc.addEventListener('load', resolve)
        }
    })

    return doc
}

class MockResourceLoader extends jsdom.ResourceLoader {
    async fetch(url: string, options) {
        const response = await mockFetch(url)
        const text = await response.text()
        return Buffer.from(text)
    }
}

// A fetch function that reads the subresources from local files.
async function mockFetch(url: string) {
    const websiteOrigin = 'https://example.com'
    const basedir = __dirname + '/example-page'

    // We simply use the file extension to determine the mime type.
    const extensionTypes = {
        'html': 'text/html',
        'css': 'text/css',
        'png': 'image/png',
        'woff': 'font/woff',
    }

    if (url.startsWith(websiteOrigin)) {
        const path = url.slice(websiteOrigin.length,)
        const content = fs.readFileSync(basedir + path)
        const mimeType = extensionTypes[url.split('.').reverse()[0]]
        const blob = new Blob([content], { type: mimeType })
        const response = new Response(blob, { status: 200 })
        Object.assign(response, { url })
        return response
    }

    if (url.startsWith('data:')) {
        const blob = await dataURLToBlob(url)
        const response = new Response(blob, { status: 200 })
        Object.assign(response, { url })
        return response
    }

    throw new Error(`Trying to fetch unknown URL: ${url}`)
}
