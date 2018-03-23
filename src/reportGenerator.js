
const fs = require('fs');
const dateFormat = require('dateformat');
const stripAnsi = require('strip-ansi');
const utils = require('./utils');
const sorting = require('./sorting');

class ReportGenerator {
	constructor(config) {
		this.config = config;
	}

	/**
	 * Generates and writes HTML report to a given path
	 * @param  {Object} data   Jest test information data
	 * @return {Promise}
	 */
	generate({ data, ignoreConsole }) {
		const fileDestination = this.config.getOutputFilepath();
		return this.getStylesheetContent()
			.then(stylesheet => this.renderHtmlReport({
				data,
				stylesheet,
			}))
			.then(xmlBuilderOutput => utils.writeFile({
				filePath: fileDestination,
				content: xmlBuilderOutput,
			}))
			.then(() => utils.logMessage({
				type: 'success',
				msg: `Report generated (${fileDestination})`,
				ignoreConsole,
			}))
			.catch(error => utils.logMessage({
				type: 'error',
				msg: error,
				ignoreConsole,
			}));
	}

	/**
	 * Returns the stylesheet to be requireed in the test report.
	 * If styleOverridePath is not defined, it will return the defined theme file.
	 * @return {Promise}
	 */
	getStylesheetContent() {
		const pathToStylesheet = this.config.getStylesheetFilepath();
		return new Promise((resolve, reject) => {
			fs.readFile(pathToStylesheet, 'utf8', (err, content) => {
				if (err) {
					return reject(new Error(`Could not locate the stylesheet: '${pathToStylesheet}': ${err}`));
				}
				return resolve(content);
			});
		});
	}

	/**
	 * Returns a HTML containing the test report.
	 * @param  {String} stylesheet
	 * @param  {Object} data		The test result data
	 * @return {xmlbuilder}
	 */
	renderHtmlReport({ data, stylesheet }) {
		return new Promise((resolve, reject) => {
			// Make sure that test data was provided
			if (!data) { return reject(new Error('Test data missing or malformed')); }

			// Fetch Page Title from config
			const pageTitle = this.config.getPageTitle();

			// Create an xmlbuilder object with HTML and Body tags
			const htmlOutput = utils.createHtmlBase({
				pageTitle,
				stylesheet,
			});

			// HEADER
			const header = htmlOutput.ele('header');
			// Page Title
			header.ele('h1', { id: 'title' }, pageTitle);
			// Logo
			const logo = this.config.getLogo();
			if (logo) {
				header.ele('img', { id: 'logo', src: logo });
			}

			// METADATA
			const metaDataContainer = htmlOutput.ele('div', { id: 'metadata-container' });
			// Timestamp
			const timestamp = new Date(data.startTime);
			metaDataContainer.ele('div', { id: 'timestamp' }, `Start: ${dateFormat(timestamp, this.config.getDateFormat())}`);
			// Test Summary
			metaDataContainer.ele('div', { class: 'summary' }, `
				${data.numTotalTestSuites} testsuites --
				${data.numPassedTestSuites} passed /
				${data.numFailedTestSuites} failed /
				${data.numPendingTestSuites} pending
			`);
			metaDataContainer.ele('div', { class: 'summary' }, `
				${data.numTotalTests} tests --
				${data.numPassedTests} passed /
				${data.numFailedTests} failed /
				${data.numPendingTests} pending
			`);

			// Apply the configured sorting of test data
			const sortedTestData = sorting.sortSuiteResults(data.testResults, this.config.getSort());

			// Test Suites
			sortedTestData.forEach((suite) => {
				// This check is only needed once per suite, since if the suite fails, no tests from the suite will have run
				// Therefore, there would only be a single fail within the suite
				const testSuiteError = this.config.shouldIncludeSuiteErrors() &&
					(typeof suite.failureMessage === 'string' &&
					suite.failureMessage.length > 0);

				if (!testSuiteError && (!suite.testResults || suite.testResults.length <= 0)) { return; }

				// Suite Information
				const suiteInfo = htmlOutput.ele('div', { class: 'suite-info' });
				// Suite Path
				suiteInfo.ele('div', { class: 'suite-path' }, suite.testFilePath);
				// Suite execution time
				const executionTime = (suite.perfStats.end - suite.perfStats.start) / 1000;
				suiteInfo.ele('div', { class: `suite-time${executionTime > 5 ? ' warn' : ''}` }, `${executionTime}s`);

				// Suite Test Table
				const suiteTable = htmlOutput.ele('table', { class: 'suite-table', cellspacing: '0', cellpadding: '0' });

				// An error occurred at the test suite level (usually due to syntax and parsing errors)
				if (testSuiteError) {
					this.renderTableRow({ item: suite, suiteTable });
				}

				// Test Results
				suite.testResults.forEach((test) => {
					this.renderTableRow({ item: test, suiteTable });
				});
			});
			return resolve(htmlOutput);
		});
	}

	/**
	 * Appends a test item to the HTML output
	 * @param   {Object}   item			Jest test item.
	 * @param	{Object}   suiteTable 	An element object that will be the parent of the new table row
	 */
	renderTableRow({ item, suiteTable }) {
		// Setup the necessary information from the test item.
		const title = item.title || item.filePath;
		const suiteTitle = item.ancestorTitles ? item.ancestorTitles.join(' > ') : title;
		const status = item.status || 'failed';
		const messages = item.failureMessages || [item.failureMessage];
		const outputMsg = item.failureMessages ? this.config.shouldIncludeFailureMessages() : this.config.shouldIncludeSuiteErrors();

		// Create the test item output HTML
		const testTr = suiteTable.ele('tr', { class: status });

		// Suite Name(s)
		testTr.ele('td', { class: 'suite' }, suiteTitle);

		// Test name
		const testTitleTd = testTr.ele('td', { class: 'test' }, title);

		// Test Failure Messages
		if (messages && outputMsg) {
			const failureMsgDiv = testTitleTd.ele('div', { class: 'failureMessages' });
			messages.forEach((failureMsg) => {
				failureMsgDiv.ele('pre', { class: 'failureMsg' }, stripAnsi(failureMsg));
			});
		}

		// Append data to <tr>
		testTr.ele('td', { class: 'result' }, (status === 'passed') ? `${status} in ${item.duration / 1000}s` : status);
	}
}

module.exports = ReportGenerator;
