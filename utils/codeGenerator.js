const pool = require('../config/database');

// =====================================================
// FUNÇÃO PARA CALCULAR DÍGITO VERIFICADOR EAN-13
// =====================================================
function calculateEAN13CheckDigit(code) {
    // code deve ter 12 dígitos
    let sum = 0;
    for (let i = 0; i < code.length; i++) {
        const digit = parseInt(code[i]);
        if ((i + 1) % 2 === 0) {
            sum += digit * 3;
        } else {
            sum += digit;
        }
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit.toString();
}

// =====================================================
// BUSCAR TIPO DE OPERAÇÃO
// =====================================================
async function getOperationTypeByIdentifier(identifier) {
    let operationType;
    
    if (typeof identifier === 'number') {
        [operationType] = await pool.query(
            'SELECT * FROM operation_types WHERE code = ? AND is_active = TRUE',
            [identifier]
        );
    } else if (typeof identifier === 'string' && identifier.match(/^\d+$/)) {
        [operationType] = await pool.query(
            'SELECT * FROM operation_types WHERE id = ? AND is_active = TRUE',
            [identifier]
        );
    } else if (typeof identifier === 'string') {
        [operationType] = await pool.query(
            'SELECT * FROM operation_types WHERE table_name = ? AND is_active = TRUE',
            [identifier]
        );
    }
    
    if (operationType.length === 0) {
        throw new Error(`Tipo de operação não encontrado: ${identifier}`);
    }
    
    return operationType[0];
}

// =====================================================
// GERAR CÓDIGO DE OPERAÇÃO EAN-13 (13 DÍGITOS)
// =====================================================
async function generateOperationCode(operationIdentifier, db = pool) {
    try {
        // 1. Buscar configuração do tipo de operação
        const operationType = await getOperationTypeByIdentifier(operationIdentifier);
        
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);     // 2 dígitos
        const month = (now.getMonth() + 1).toString().padStart(2, '0'); // 2 dígitos
        const day = now.getDate().toString().padStart(2, '0');          // 2 dígitos
        const dateCode = `${year}${month}${day}`; // 6 dígitos (AAMMDD)
        const todayDate = `${year}-${month}-${day}`;
        
        // Prefixo fixo (2 para itens internos)
        const prefix = '2';
        
        // Código do tipo de operação (2 dígitos, 01-99)
        const typeCode = operationType.code.toString().padStart(2, '0');
        
        // Base do código sem contador e verificador (12 dígitos)
        // Estrutura: 2 + AAMMDD + OO = 10 dígitos (1 + 6 + 2)
        const baseCode = `${prefix}${dateCode}${typeCode}`;
        
        // 2. Incrementar contador diário para esta operação
        let counter;
        
        await db.query('START TRANSACTION');
        
        const [existingCounter] = await db.query(
            `SELECT counter FROM operation_counters 
             WHERE operation_type_id = ? AND counter_date = ?
             FOR UPDATE`,
            [operationType.id, todayDate]
        );
        
        if (existingCounter.length === 0) {
            counter = 1;
            await db.query(
                `INSERT INTO operation_counters 
                 (operation_type_id, counter_date, counter)
                 VALUES (?, ?, ?)`,
                [operationType.id, todayDate, counter]
            );
        } else {
            counter = existingCounter[0].counter + 1;
            await db.query(
                `UPDATE operation_counters 
                 SET counter = ? 
                 WHERE operation_type_id = ? AND counter_date = ?`,
                [counter, operationType.id, todayDate]
            );
        }
        
        await db.query('COMMIT');
        
        // Contador (3 dígitos, 001-999)
        const counterCode = counter.toString().padStart(3, '0');
        
        // Código completo com 12 dígitos (sem verificador)
        // Estrutura: 2 + AAMMDD + OO + NNN
        const fullCode = `${baseCode}${counterCode}`;
        
        // Calcular dígito verificador EAN-13 (sobre os 12 dígitos)
        const checkDigit = calculateEAN13CheckDigit(fullCode);
        
        // Código final com 13 dígitos
        const finalCode = `${fullCode}${checkDigit}`;
        
        console.log(`📝 Código gerado para ${operationType.name}: ${finalCode}`);
        console.log(`   Estrutura: ${prefix} ${dateCode} ${typeCode} ${counterCode} ${checkDigit}`);
        
        return {
            code: finalCode,
            fullCode: finalCode,
            prefix,
            dateCode,
            typeCode: operationType.code,
            counter,
            checkDigit,
            operationType: operationType.name,
            operationTypeId: operationType.id
        };
        
    } catch (error) {
        console.error('❌ Erro ao gerar código de operação:', error);
        await db.query('ROLLBACK');
        throw error;
    }
}

// =====================================================
// REGISTRAR CÓDIGO GERADO COM REFERÊNCIA
// =====================================================
async function saveOperationCode(operationCode, operationTypeId, referenceId, db = pool) {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;
    
    // Extrair contador do código (posições 10-12)
    const counter = parseInt(operationCode.substring(9, 12));
    
    await db.query(
        `INSERT INTO operation_codes 
         (operation_code, operation_type_id, reference_id, counter_date, counter)
         VALUES (?, ?, ?, ?, ?)`,
        [operationCode, operationTypeId, referenceId, todayDate, counter]
    );
    
    console.log(`💾 Código ${operationCode} registrado para referência ${referenceId}`);
}

// =====================================================
// REGISTRAR OPERAÇÃO COMPLETA
// =====================================================
async function registerOperation(operationIdentifier, referenceId, db = pool) {
    const { code, operationTypeId } = await generateOperationCode(operationIdentifier, db);
    await saveOperationCode(code, operationTypeId, referenceId, db);
    return code;
}

// =====================================================
// EXTRAIR INFORMAÇÕES DO CÓDIGO
// =====================================================
async function parseOperationCode(code) {
    if (!code || code.length !== 13) return null;
    
    const prefix = code[0];                         // Posição 1
    const dateCode = code.substring(1, 7);          // Posições 2-7 (AAMMDD)
    const typeCode = parseInt(code.substring(7, 9)); // Posições 8-9 (OO)
    const counter = parseInt(code.substring(9, 12)); // Posições 10-12 (NNN)
    const checkDigit = code[12];                     // Posição 13 (V)
    
    // Validar dígito verificador
    const calculatedCheck = calculateEAN13CheckDigit(code.substring(0, 12));
    if (calculatedCheck !== checkDigit) {
        console.warn('⚠️ Dígito verificador inválido para código:', code);
    }
    
    // Extrair data
    const year = 2000 + parseInt(dateCode.substring(0, 2));
    const month = parseInt(dateCode.substring(2, 4));
    const day = parseInt(dateCode.substring(4, 6));
    const date = new Date(year, month - 1, day);
    
    // Buscar tipo de operação
    let operationType = null;
    try {
        operationType = await getOperationTypeByIdentifier(typeCode);
    } catch (error) {
        console.warn('Tipo de operação não encontrado:', typeCode);
    }
    
    return {
        fullCode: code,
        prefix,
        date,
        dateCode,
        typeCode,
        typeName: operationType?.name || 'Desconhecido',
        tableName: operationType?.table_name || 'desconhecido',
        counter,
        checkDigit,
        isValid: calculatedCheck === checkDigit
    };
}

// =====================================================
// LISTAR TODOS OS TIPOS DE OPERAÇÃO
// =====================================================
async function listOperationTypes() {
    const [types] = await pool.query(
        'SELECT * FROM operation_types WHERE is_active = TRUE ORDER BY code'
    );
    return types;
}

// =====================================================
// BUSCAR CÓDIGOS POR REFERÊNCIA
// =====================================================
async function getOperationCodesByReference(referenceId, operationIdentifier = null) {
    let query = 'SELECT * FROM operation_codes WHERE reference_id = ?';
    const params = [referenceId];
    
    if (operationIdentifier) {
        const operationType = await getOperationTypeByIdentifier(operationIdentifier);
        query += ' AND operation_type_id = ?';
        params.push(operationType.id);
    }
    
    const [codes] = await pool.query(query, params);
    return codes;
}

// =====================================================
// BUSCAR REFERÊNCIA POR CÓDIGO
// =====================================================
async function getReferenceByOperationCode(code) {
    const [codes] = await pool.query(
        'SELECT * FROM operation_codes WHERE operation_code = ?',
        [code]
    );
    
    if (codes.length === 0) return null;
    
    const codeInfo = codes[0];
    let operationType = null;
    try {
        operationType = await getOperationTypeByIdentifier(codeInfo.operation_type_id);
    } catch (error) {
        console.warn('Tipo de operação não encontrado:', codeInfo.operation_type_id);
    }
    
    return {
        operationCode: codeInfo.operation_code,
        operationType: operationType?.name || 'Desconhecido',
        tableName: operationType?.table_name || 'desconhecido',
        referenceId: codeInfo.reference_id,
        createdAt: codeInfo.created_at
    };
}

module.exports = {
    calculateEAN13CheckDigit,
    getOperationTypeByIdentifier,
    generateOperationCode,
    saveOperationCode,
    registerOperation,
    parseOperationCode,
    listOperationTypes,
    getOperationCodesByReference,
    getReferenceByOperationCode
};