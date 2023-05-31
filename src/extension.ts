import * as vscode from 'vscode';
import * as babel from "@babel/core";
import * as fs from "fs";
import * as t from "@babel/types";
import generate from '@babel/generator'
import axios from 'axios'


//@ts-ignore
import { hasProp } from 'jsx-ast-utils';

function guid() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		var r = Math.random() * 16 | 0,
			v = c == 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

const getASTFromTsx = (code: string): any | null => {
	try {
		const ast = babel.parseSync(code, {
			sourceType: "module",
			plugins: [
				[require("@babel/plugin-transform-typescript"), { isTSX: true } as any],
			],
		});
		return ast;
	} catch (e) {
		vscode.window.showErrorMessage(`语法错误，请先修复`);

	}

};
const changeSrc = (urls: any) => {
	return vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "替换中",
		cancellable: false
	}, async (progress) => {
		return axios.post('https://dev-api.hunliji.com/hms/mediacenter/appApi/media/syncRemoteSrcList', {
			syncBaseList: urls.map((item: any) => {
				return {
					remoteSrcUrl: item,
					key: guid()
				};
			}),
			appId: '19160ce307ef6c0eae33d2cdc166ef4c',
		}).then(res => {
			let result: never[] = [];
			const { data } = res;
			result = data.data.map((item: any) => {
				return {
					old: item.remoteSrcUrl,
					new: item.domain + '/' + item.saveKey
				};
			});
			return result
		}).catch(err => vscode.window.showErrorMessage(`Error Occurred: ${err}`));
	});


};

export function activate(context: vscode.ExtensionContext) {
	let myButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);

	myButton.text = "D2C";
	myButton.command = "replace-d2c.replaceImage";
	myButton.color = new vscode.ThemeColor("myButton.color");
	myButton.show();
	let disposable = vscode.commands.registerCommand('replace-d2c.replaceImage', async () => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			let currentCode = editor.document.getText();
			const document = editor.document;
			let ast = getASTFromTsx(currentCode);
			const urls: string | any[] = [];
			babel.traverse(ast, {
				JSXElement: {
					enter: (path) => {
						//@ts-expect-error
						if (path.node.openingElement.name.name === 'img' && hasProp(path.node.openingElement.attributes, 'src')) {
							const attributes = path.node.openingElement.attributes;
							for (let i = 0; i < attributes.length; i++) {
								const e = attributes[i];
								//@ts-expect-error
								if (e.name.name === 'src' && typeof (e.value.value) === 'string') {
									//@ts-expect-error
									urls.push(e.value.value);
								}
							}
						}
					}
				}
			});
			const data: any = await changeSrc(urls).then();
			data.forEach((e: any) => {
				currentCode = currentCode.replace(e.old, e.new);
			});
			ast = getASTFromTsx(currentCode);
			const hljdSource: any = [];
			let flag = false;
			for (let i = 0; i < ast.program.body.length; i++) {
				if (t.isImportDeclaration(ast.program.body[i])) {
					if (ast.program.body[i].source.value === '@douyinfe/semi-ui' || ast.program.body[i].source.value === 'hljd') {
						flag = true;
						ast.program.body[i].specifiers.forEach((node: any) => {
							hljdSource.push(node.local.name);
						});
						ast.program.body.splice(i, 1);
						i--;
					}
				}
			}
			if (flag) {
				const importStr = `import {${[...new Set(hljdSource)].join(',')}} from "hljd"`;
				let importAST = babel.parseSync(importStr);
				ast.program.body.unshift(importAST?.program.body[0]);
			}

			const newCode = generate(ast).code;
			// 将修改后的代码写回文件中
			fs.writeFile(document.uri.fsPath, newCode, error => {
				if (error) {
					vscode.window.showErrorMessage(`替换失败: ${error.message}`);
					return;
				}
				vscode.window.showInformationMessage('替换成功');
			});
			return ast;
		}
	});
	// 将订阅列表添加到上下文中
	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }