const codeExtension = /\.(?:[cm]?[jt]sx?)$/
const notMeasured = /(?:^|\/)(?:node_modules|dist|coverage|e2e|generated|__tests__|__test__|\.wrangler)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$|(?:^|\/)[^/]+\.config\.[cm]?[jt]s$/

/** whether a changed path is code that unit coverage should measure: not a test, e2e spec, config file, declaration or build output */
export const isSourcePath = (path: string) => codeExtension.test(path) && !notMeasured.test(path)
