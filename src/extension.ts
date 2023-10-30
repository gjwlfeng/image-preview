// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import path = require('path');
import fs = require('fs');
const { init, localize } = require("vscode-nls-i18n");


var outputChannel: vscode.LogOutputChannel;  // 输出通道

/**
 * 输出信息到控制台上，输出通道为MyCoder
 * @param message 输出的文本信息
 */
export function myLog() {
	if (outputChannel === undefined) {
		outputChannel = vscode.window.createOutputChannel('image-preview-view', {
			log: true,
		});
	}
	return outputChannel;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	myLog().info('image-preview-view is now active!');

	init(context.extensionPath);

	let webViewProvider: EditViewImagePreviewViewProvider | undefined;
	let imageThemeStorage: ImageThemeStorage = new ImageThemeStorage(context, `${context.extension.extensionPath}_image_theme`);

	let onDidDispose: () => void = () => {
		webViewProvider = undefined;
	};

	let onDidReceiveMessage: (data: any) => any = (data: any) => {
		switch (data.type) {
			case 'insertCode': {
				let imgItem = JSON.parse(data.data);
				vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`${imgItem.basename}`));
				break;
			}
			case "iamgeSwitchTheme": {
				imageThemeStorage.addImageTheme(data.data.imagePath, data.data.theme);
				break;
			}
			case "iamgeCopyName": {
				try {
					let imgItem = JSON.parse(data.data);
					console.log(`iamgeCopyName=${imgItem.basename},${imgItem.imagePath}`);
					let success = vscode.commands.executeCommand('image-preview-view.copyImageName', {
						basename: imgItem.basename,
						imagePath: imgItem.imagePath
					});
				} catch (e) {
					console.log(`iamgeCopyName=${e},`);
				}
				break;
			}
			case 'imageDirRefresh': {
				let imageDir = JSON.parse(data.data);
				const imageSuffixs = vscode.workspace.getConfiguration().get<string[]>("image-preview-view.imageSuffix") || [];
				myLog().info(`dirPath=${imageDir.dirPath}`);
				let imgFileList = getFils([vscode.Uri.file(imageDir.dirPath)], (filePath: string) => {
					const parsedPath = path.parse(filePath);
					if (imageSuffixs.indexOf(parsedPath.ext.toLowerCase()) > -1) {
						return true;
					} else {
						myLog().error(`Unsupported file type! ${filePath}`);
						return false;
					}
				});
				webViewProvider?.addImagesDir(imageDir.dirPath, imgFileList);
				break;
			}
			case 'itemLocation': {
				let imageDir = JSON.parse(data.data);
				try {
					let uri = vscode.Uri.file(imageDir.dirPath);
					console.log(`itemLocation=${imageDir.dirPath}`);
					let success = vscode.commands.executeCommand('revealInExplorer', uri);
				} catch (e) {
					console.log(`itemLocation=${imageDir.dirPath},${e},`);
				}
				break;
			}
			case 'itemExplorer': {
				let imageDir = JSON.parse(data.data);
				try {
					let uri = vscode.Uri.file(imageDir.dirPath);
					console.log(`itemExplorer=${imageDir.dirPath}`);
					let success = vscode.commands.executeCommand('revealFileInOS', uri);
				} catch (e) {
					console.log(`itemExplorer=${imageDir.dirPath},${e},`);
				}
				break;
			}
			case 'refresh': {
				let imgDirList = JSON.parse(data.data);

				const imageDirList: any[] = [];

				const imageSuffixs = vscode.workspace.getConfiguration().get<string[]>("image-preview-view.imageSuffix") || [];

				for (let index = 0; index < imgDirList.length; index++) {
					const item = imgDirList[index];
					myLog().info(`dirPath=${item.dirPath}`);
					let imgFileList = getFils([vscode.Uri.file(item.dirPath)], (filePath: string) => {
						const parsedPath = path.parse(filePath);
						if (imageSuffixs.indexOf(parsedPath.ext.toLowerCase()) > -1) {
							return true;
						} else {
							myLog().error(`Unsupported file type! ${filePath}`);
							return false;
						}
					});

					myLog().info(`imgs=${imgFileList}`);

					const imageFileList: any[] = [];
					imgFileList.forEach((value) => {
						imageFileList.push({
							imagePath: value,
							imageVsCodePath: webViewProvider?.asWebviewUri(vscode.Uri.file(value)).toString(),
							basename: path.basename(value)
						});
					});

					imageDirList.push({
						dirPath: item.dirPath,
						dirBaseName: path.basename(item.dirPath),
						chidler: imageFileList,
					});
				}
				webViewProvider?.postMessage({
					type: 'updateAll',
					data: imageDirList
				});
				break;
			}
			case 'get_all_image_theme': {
				let imageThemeList = imageThemeStorage.getAllImageTheme();
				webViewProvider?.postMessage({
					type: 'all_image_theme',
					data: imageThemeList
				});
				break;
			}
		}
	};

	vscode.window.registerWebviewPanelSerializer(EditViewImagePreviewViewProvider.viewType, new ImagePreviewViewSerializer(context, onDidReceiveMessage, onDidDispose, (_provider: EditViewImagePreviewViewProvider, state: any) => {
		webViewProvider = _provider;
	}),);

	let addImageDirDisposable = vscode.commands.registerCommand('image-preview-view.addImagesDir', async (focusUri: vscode.Uri, selectedUris: vscode.Uri[]) => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		myLog().info(`image-preview-view--------------------`);

		if (focusUri === null) {
			vscode.window.showErrorMessage('Please select a dir!');
			myLog().error("Please select a dir!");
			return;
		}

		const focusFile = fs.lstatSync(focusUri.fsPath);
		if (!focusFile.isDirectory()) {
			vscode.window.showErrorMessage('Please select a dir!');
			myLog().error("Please select a dir!");
			return;
		}

		const columnToShowIn = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (webViewProvider === undefined) {
			webViewProvider = new EditViewImagePreviewViewProvider(context, onDidReceiveMessage, onDidDispose);
			webViewProvider.init();
		} else {
			webViewProvider.reveal(columnToShowIn);
		}

		const imageSuffixs = vscode.workspace.getConfiguration().get<string[]>("image-preview-view.imageSuffix") || [];
		const fileList = getFils(selectedUris, (filePath: string) => {
			const parsedPath = path.parse(filePath);
			if (imageSuffixs.indexOf(parsedPath.ext.toLowerCase()) > -1) {
				return true;
			} else {
				myLog().error(`Unsupported file type! ${filePath}`);
				return false;
			}
		});

		webViewProvider.addImagesDir(focusUri.fsPath, fileList);
	});

	let copyImageNameDisposable = vscode.commands.registerCommand('image-preview-view.copyImageName', async (args) => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		myLog().info(`image-preview-view--------------------`);
		myLog().info(args);
		vscode.env.clipboard.writeText(path.parse(args.imagePath).name);
	});


	let delImageDisposable = vscode.commands.registerCommand('image-preview-view.delImage', async (args) => {

		console.log(`delImage=${args.imagePath}`);
		const yesText = localize('image-preview-view.yes');
			const noText = localize('image-preview-view.no');
		const deleteConfirmationText = localize('image-preview-view.delete_confirmation');
		const isDeleteFileText = localize('image-preview-view.is_delete_file', path.basename(args.imagePath));
		const failedToDeleteFileText = vscode.l10n.t('image-preview-view.failed_to_delete_file');

		let selectList = [{ id: 1, label:yesText }, { id: 2, label:noText}];
		vscode.window.showQuickPick<any>(selectList, {
			title: deleteConfirmationText,
			placeHolder: isDeleteFileText,
			ignoreFocusOut: false,
			canPickMany: false,
		}).then((item) => {
			if (item.id == 1) {
				fs.unlink(args.imagePath, (error) => {
					if (error) {
						console.log(`delImage=${error}`);
						vscode.window.showErrorMessage(failedToDeleteFileText);
					} else {
						console.log(`delImage=success`);
						webViewProvider?.delImage(args.imagePath);
					}
				});
			}
		});


	});

	let localItemDisposable = vscode.commands.registerCommand('image-preview-view.localItem', async (args) => {
		try {
			console.log(`localItem=${args.basename},${args.imagePath}`);
			let uri = vscode.Uri.file(args.imagePath);
			let success = vscode.commands.executeCommand('revealInExplorer', uri);
			console.log(`localItem=${success}`);
		} catch (e) {
			console.log(`localItem=${e},`);
		}
	});

	let openExplorerDisposable = vscode.commands.registerCommand('image-preview-view.openExplorer', async (args) => {
		try {
			console.log(`openExplorer=${args.basename},${args.imagePath}`);
			let uri = vscode.Uri.file(args.imagePath);
			let success = vscode.commands.executeCommand('revealFileInOS', uri);
			console.log(`openExplorer=${success}`);
		} catch (e) {
			console.log(`openExplorer=${e},`);
		}
	});

	let changeToImageDefalutThemeDisposable = vscode.commands.registerCommand('image-preview-view.changeToImageDefaultTheme', async (args) => {

		console.log(`changeToImageDarkTheme=0,${args.imagePath}`);
		webViewProvider?.changeToImageTheme(args.imagePath, 0);
		imageThemeStorage.removeImageTheme(args.imagePath);
	});

	let changeToImageLightThemeDisposable = vscode.commands.registerCommand('image-preview-view.changeToImageLightTheme', async (args) => {

		console.log(`changeToImageDarkTheme=2,${args.imagePath}`);
		webViewProvider?.changeToImageTheme(args.imagePath, 2);
		imageThemeStorage.addImageTheme(args.imagePath, 2);

	});

	let changeToImageDartThemeDisposable = vscode.commands.registerCommand('image-preview-view.changeToImageDarkTheme', async (args) => {
		console.log(`changeToImageDarkTheme=1,${args.imagePath}`);
		webViewProvider?.changeToImageTheme(args.imagePath, 1);
		imageThemeStorage.addImageTheme(args.imagePath, 1);

	});

	let refreshDisposable = vscode.commands.registerCommand('image-preview-view.refresh', async (args) => {
		console.log(`refresh,${args}`);
		webViewProvider?.refresh();

	});

	

	context.subscriptions.push(addImageDirDisposable);
	context.subscriptions.push(copyImageNameDisposable);
	context.subscriptions.push(localItemDisposable);
	context.subscriptions.push(openExplorerDisposable);
	context.subscriptions.push(changeToImageDefalutThemeDisposable);
	context.subscriptions.push(changeToImageLightThemeDisposable);
	context.subscriptions.push(changeToImageDartThemeDisposable);
	context.subscriptions.push(delImageDisposable);
	context.subscriptions.push(refreshDisposable);
}

/**
 * 获取选中文件,或文件夹下的文件,不递归
 * @param selectedUris 
 */
function getFils(selectedUris: vscode.Uri[], callback: (path: string) => boolean) {
	const filePaths: string[] = [];
	for (let index = 0; index < selectedUris.length; index++) {
		const uri = selectedUris[index];
		var stat = fs.lstatSync(uri.fsPath);
		if (stat.isDirectory()) {
			const childFils = fs.readdirSync(uri.fsPath);
			for (let f = 0; f < childFils.length; f++) {
				const childFilePath = path.join(uri.fsPath, childFils[f]);
				var childStat = fs.lstatSync(childFilePath);
				if (childStat.isFile() && callback.call(childFilePath, childFilePath)) {
					filePaths.push(childFilePath);
				}
			}
		} else if (stat.isFile() && callback.call(uri.fsPath, uri.fsPath)) {
			filePaths.push(uri.fsPath);
		}
	}
	return filePaths;
}
// This method is called when your extension is deactivated
export function deactivate() {
	myLog().info('image-preview-view is now deactivate!');
}




class EditViewImagePreviewViewProvider {

	public static readonly viewType = 'image-preview-view.ImagePreviewView';

	private _view?: vscode.WebviewPanel;
	private _context: vscode.ExtensionContext;
	private _onDidDispose: () => void;
	private _onDidReceiveMessage: (data: any) => any;

	constructor(
		context: vscode.ExtensionContext,
		onDidReceiveMessage: (data: any) => any,
		didDispose: () => void,

	) {
		this._context = context;
		this._onDidReceiveMessage = onDidReceiveMessage;
		this._onDidDispose = didDispose;
	}

	public reveal(viewColumn?: vscode.ViewColumn) {
		this._view?.reveal(viewColumn);
	}

	public asWebviewUri(localResource: vscode.Uri): vscode.Uri {
		return this._view!!.webview.asWebviewUri(localResource);
	}

	public postMessage(data: any): Thenable<boolean> {
		return this._view!!.webview.postMessage(data);
	}

	public init(): void;

	public init(view?: vscode.WebviewPanel | undefined): void;

	public init(view?: vscode.WebviewPanel) {
		if (view !== undefined) {
			this._view = view!!;
		} else {
			this._view = vscode.window.createWebviewPanel(
				EditViewImagePreviewViewProvider.viewType,
				'Image Preview',
				vscode.ViewColumn.One,
				{ enableScripts: true, }
			);
		}

		// And set its HTML content
		this._view.webview.html = this.getHtmlForWebview();

		this._view.webview.onDidReceiveMessage((data) => {
			this._onDidReceiveMessage?.call(this, data);
		});

		this._view.webview.onDidReceiveMessage(data => {
			myLog().info(data);
			this._onDidReceiveMessage.call(this, data);
		});

		this._view.onDidDispose(
			() => {
				this._view = undefined;
				this._onDidDispose();
			},
			null,
			this._context.subscriptions
		);

	}


	public setting() {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'setting'
			});
		} else {
			console.log("failure");
		}
	}

	public refresh() {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'refresh'
			});
		} else {
			console.log("failure");
		}
	}

	public delAll() {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'delAll'
			});
		} else {
			console.log("failure");
		}
	}

	public delImage(imagePath: string) {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'delImage',
				data: {
					imagePath
				}
			});
		} else {
			console.log("failure");
		}
	}


	public changeToImageTheme(imagePath: string, theme: number) {
		if (this._view) {
			this._view.webview.postMessage({ type: 'changeToImageTheme', imagePath, theme });
		} else {
			console.log("failure");
		}
	}


	public addImagesDir(dirPath: string, images: string[]) {
		if (this._view) {
			let webView: vscode.Webview = this._view.webview;
			const vscodeUrlList: any[] = [];
			images.forEach((value) => {
				vscodeUrlList.push({
					imagePath: value,
					imageVsCodePath: webView.asWebviewUri(vscode.Uri.file(value)).toString(),
					basename: path.basename(value)
				});
			});

			webView.postMessage({
				type: 'addImagesDir', data: {
					dirPath,
					dirBaseName: path.basename(dirPath),
					chidler: vscodeUrlList,
				}
			}).then(() => {
				console.log("Image preview added successfully!");
			}, () => {
				console.log("Failed to add image preview, please try again!");
				vscode.window.showErrorMessage('Please try again!');
			});
		} else {
			console.log("failure");
		}
	}

	public addColor() {
		if (this._view) {

			this._view.webview.postMessage({ type: 'addColor' });
		}
	}

	public clearColors() {
		if (this._view) {
			this._view.webview.postMessage({ type: 'clearColors' });
		}
	}

	private getHtmlForWebview() {

		const jsFilePath =
			vscode.Uri.joinPath(this._context.extensionUri, 'template', 'index-9d718c3e.js');
		const cssFilePath =
			vscode.Uri.joinPath(this._context.extensionUri, 'template', 'index-8c1ff1a5.css');


		let jsUrl = this._view!!.webview.asWebviewUri(jsFilePath).toString();
		let cssUrl = this._view!!.webview.asWebviewUri(cssFilePath).toString();

		// data-vscode-context='{"webviewSection": "editor", "preventDefaultContextMenuItems": true}'

		return `<!DOCTYPE html>
		<html lang="en" data-vscode-context='{"webviewSection": "editor", "preventDefaultContextMenuItems": true}'>
		  <head>
			<meta charset="UTF-8">
			<link rel="icon" href="/favicon.ico">
			
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Image Preview</title>
			
			<script type="module" crossorigin src="${jsUrl}"></script>
			
			<link rel="stylesheet" href="${cssUrl}">
		  </head>
		  <body >
			<div id="app"></div>
		  </body>
		</html>`;

	}
}

class ImagePreviewViewSerializer implements vscode.WebviewPanelSerializer {

	private _context: vscode.ExtensionContext;
	private _onDidDispose: () => void;
	private _onDidReceiveMessage: (data: any) => any;
	private _onDeserializeWebviewPanel: (provide: EditViewImagePreviewViewProvider, state: any) => void;


	constructor(context: vscode.ExtensionContext, didReceiveMessage: (data: any) => any, didDispose: () => void, onDeserializeWebviewPanel: (provide: EditViewImagePreviewViewProvider, state: any) => void) {
		this._context = context;
		this._onDidDispose = didDispose;
		this._onDidReceiveMessage = didReceiveMessage;
		this._onDeserializeWebviewPanel = onDeserializeWebviewPanel;
	}

	async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
		// `state` is the state persisted using `setState` inside the webview
		console.log(`Got state: ${state}`);
		let provide: EditViewImagePreviewViewProvider = new EditViewImagePreviewViewProvider(this._context, this._onDidReceiveMessage, this._onDidDispose);
		provide.init(webviewPanel);
		this._onDeserializeWebviewPanel(provide, state);
	}
}

class ImageThemeStorage {
	context: vscode.ExtensionContext;
	key: string;

	constructor(context: vscode.ExtensionContext, key: string) {
		this.context = context;
		this.key = key;
		context.globalState.setKeysForSync([key]);
	}

	/**
	 * 
	 * 添加图片主题
	 */
	public addImageTheme(imagePath: string, theme: number) {
		let themeList = this.context.globalState.get(this.key) as any[] | undefined;
		if (themeList === undefined) {
			themeList = [];
		}

		let curTheme = themeList.find((theme) => {
			return theme.imagePath == imagePath;
		});

		if (curTheme === undefined) {
			themeList.push({
				imagePath,
				theme
			});
		} else {
			curTheme.theme = theme;
		}

		this.context.globalState.update(this.key, themeList);
	}

	/**
	 * 
	 * 根据图片路径获取单个图片主题
	 */
	public getImageTheme(imagePath: string): any {
		let themeList = this.context.globalState.get(this.key) as any[] | undefined;
		if (themeList === undefined) {
			themeList = [];
		}
		let iamgeTheme = themeList.find((item) => {
			return item.imagePath === imagePath;
		});
		return iamgeTheme;
	}

	/**
	 * 
	 * 根据图片路径删除图片主题
	 */
	public removeImageTheme(imagePath: string) {
		let themeList = this.context.globalState.get(this.key) as any[] | undefined;
		if (themeList === undefined) {
			themeList = [];
		}

		let newThemeList: any[] = [];
		themeList.forEach((item) => {
			if (item.imagePath !== imagePath) {
				newThemeList.push(item);
			}
		});
		this.context.globalState.update(this.key, newThemeList);
	}

	/**
	 * 
	 * @returns 所有图片主题
	 */
	public getAllImageTheme(): any[] {
		let themeList = this.context.globalState.get(this.key) as any[] | undefined;
		if (themeList === undefined) {
			themeList = [];
		}
		return themeList;
	}

}
