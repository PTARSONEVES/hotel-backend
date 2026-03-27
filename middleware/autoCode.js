const { registerOperation, getOperationTypeByIdentifier } = require('../utils/codeGenerator');

// Middleware para gerar código automaticamente
function autoGenerateCode(tableName, codeField = 'operation_code') {
    return async (req, res, next) => {
        try {
            // Se o código já foi enviado, não gerar
            if (req.body[codeField]) {
                return next();
            }
            
            const operationType = await getOperationTypeByIdentifier(tableName);
            
            // Gerar código após a inserção (usaremos res.locals)
            res.locals.operationTypeId = operationType.id;
            res.locals.tableName = tableName;
            res.locals.codeField = codeField;
            
            next();
        } catch (error) {
            console.error('Erro no middleware de código:', error);
            next();
        }
    };
}

// Função para aplicar o código após criação
async function applyGeneratedCode(req, res, result) {
    if (res.locals.operationTypeId && result.insertId) {
        const code = await registerOperation(
            res.locals.operationTypeId,
            result.insertId,
            req.app.locals.pool
        );
        
        // Atualizar o registro com o código gerado
        await req.app.locals.pool.query(
            `UPDATE ${res.locals.tableName} 
             SET ${res.locals.codeField} = ? 
             WHERE id = ?`,
            [code, result.insertId]
        );
        
        res.locals.generatedCode = code;
    }
}

module.exports = {
    autoGenerateCode,
    applyGeneratedCode
};