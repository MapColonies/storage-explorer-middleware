# Storage Explorer Middleware

A node.js middleware used to expose explorer endpoint, accessing directories and files.


***Installation***

Using npm

    npm i @map-colonies/storage-explorer-middleware
    
  *OR*

Using yarn

    yarn add @map-colonies/storage-explorer-middleware

*import middleware and types*

    import  StorageExplorerMiddleware, { ImountDirObj } from  '@map-colonies/storage-explorer-middleware';


***Usage***

Simply connect the middleware to your server instance and pass the required parameters to the function .

*MIddleware creator signature*

    function  getStorageExplorerMiddleware(mountDirs: ImountDirObj[], logger: Record<string, unknown>): Router

*ImountDirObj interface*

    interface  ImountDirObj {
	    physical: string;
	    displayName: string;
	    includeFilesExt?: string[];
    }

*Usage example* 

    app.use(StorageExplorerMiddleware(
    [
	    {
		    physical: 'mount-dir-path',
		    displayName: 'my-special-directory-name',
		    includeFilesExt: ['jpeg', 'png', 'gif']
	    },
	    {
		    physical: 'second-mount-dir-path',
		    displayName: 'random_files',
	    }
    ]
    , this.logger))


***Notes***

Please make sure to add file explorer routes to your openapi.yaml file, or all middleware routes will be blocked.
*(You can also add it to the ignore path regex to exclude explorer routes from the validations)*
You can find an example for the openapi.yaml file [here](https://github.com/MapColonies/storage-explorer-middleware/blob/master/examples-files/openapi3.yaml).


