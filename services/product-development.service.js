const { Op } = require('sequelize')
const ProductDevelopmentProduct = require('../models/product-development-product.model')

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function getTrimmedText(value) {
  return String(value || '').trim()
}

function normalizeOptionalEmail(value) {
  const normalizedValue = getTrimmedText(value).toLowerCase()
  return normalizedValue || null
}

function normalizeBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  if (typeof value === 'boolean') {
    return value
  }

  const normalizedValue = String(value).trim().toLowerCase()

  if (['true', '1', 'yes', 'y', 'on'].includes(normalizedValue)) {
    return true
  }

  if (['false', '0', 'no', 'n', 'off'].includes(normalizedValue)) {
    return false
  }

  return fallback
}

function formatDateOnly(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTodayDateOnly() {
  return formatDateOnly(new Date())
}

function addDays(dateOnlyValue, numberOfDays) {
  const [year, month, day] = String(dateOnlyValue)
    .split('-')
    .map((entry) => Number(entry))
  const nextDate = new Date(year, month - 1, day)
  nextDate.setDate(nextDate.getDate() + Number(numberOfDays || 0))
  return formatDateOnly(nextDate)
}

function normalizeDeadline(value) {
  const normalizedValue = getTrimmedText(value)

  if (!normalizedValue) {
    throw createHttpError(400, 'Deadline is required.')
  }

  const isoMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (isoMatch) {
    const [, year, month, day] = isoMatch
    const parsedDate = new Date(Number(year), Number(month) - 1, Number(day))

    if (
      parsedDate.getFullYear() !== Number(year) ||
      parsedDate.getMonth() !== Number(month) - 1 ||
      parsedDate.getDate() !== Number(day)
    ) {
      throw createHttpError(400, 'Invalid deadline.')
    }

    return normalizedValue
  }

  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(400, 'Invalid deadline.')
  }

  return parsedDate.toISOString().slice(0, 10)
}

function getDeadlineStatus(deadline, referenceDate = getTodayDateOnly()) {
  const normalizedDeadline = getTrimmedText(deadline)

  if (!normalizedDeadline) {
    return 'no-deadline'
  }

  if (normalizedDeadline < referenceDate) {
    return 'overdue'
  }

  if (normalizedDeadline === referenceDate) {
    return 'due-today'
  }

  if (normalizedDeadline <= addDays(referenceDate, 7)) {
    return 'upcoming'
  }

  return 'scheduled'
}

function serializeProduct(product) {
  const rawProduct =
    product && typeof product.toJSON === 'function' ? product.toJSON() : product || {}
  const normalizedDeadline = getTrimmedText(rawProduct.deadline) || null
  const deadlineStatus = getDeadlineStatus(normalizedDeadline)
  const normalizedRef = getTrimmedText(rawProduct.product_ref)
  const normalizedName = getTrimmedText(rawProduct.product_name)
  const normalizedCreatedByEmail = normalizeOptionalEmail(rawProduct.created_by_email)

  return {
    id: rawProduct.id,
    product_ref: normalizedRef,
    productRef: normalizedRef,
    product_name: normalizedName,
    productName: normalizedName,
    deadline: normalizedDeadline,
    deadline_status: deadlineStatus,
    deadlineStatus,
    created_by_email: normalizedCreatedByEmail,
    createdByEmail: normalizedCreatedByEmail,
    is_archived: Boolean(rawProduct.is_archived),
    isArchived: Boolean(rawProduct.is_archived),
    archived_at: rawProduct.archived_at ?? null,
    archivedAt: rawProduct.archived_at ?? null,
    createdAt: rawProduct.createdAt ?? rawProduct.created_at ?? null,
    updatedAt: rawProduct.updatedAt ?? rawProduct.updated_at ?? null,
  }
}

function sortSerializedProducts(products = []) {
  return [...products].sort((leftProduct, rightProduct) => {
    const leftDeadline = getTrimmedText(leftProduct?.deadline)
    const rightDeadline = getTrimmedText(rightProduct?.deadline)

    if (leftDeadline && rightDeadline && leftDeadline !== rightDeadline) {
      return leftDeadline.localeCompare(rightDeadline)
    }

    if (leftDeadline && !rightDeadline) {
      return -1
    }

    if (!leftDeadline && rightDeadline) {
      return 1
    }

    const leftCreatedAt = new Date(leftProduct?.createdAt || 0).getTime()
    const rightCreatedAt = new Date(rightProduct?.createdAt || 0).getTime()
    return rightCreatedAt - leftCreatedAt
  })
}

function buildWhereClause(options = {}) {
  const searchTerm = getTrimmedText(options.search)
  const deadlineStatus = getTrimmedText(
    options.deadline_status ?? options.deadlineStatus,
  ).toLowerCase()
  const referenceDate = getTodayDateOnly()
  const queryConditions = []

  if (searchTerm) {
    queryConditions.push({
      [Op.or]: [
        {
          product_ref: {
            [Op.iLike]: `%${searchTerm}%`,
          },
        },
        {
          product_name: {
            [Op.iLike]: `%${searchTerm}%`,
          },
        },
      ],
    })
  }

  if (deadlineStatus === 'due-today') {
    queryConditions.push({
      deadline: referenceDate,
    })
  }

  if (deadlineStatus === 'upcoming') {
    queryConditions.push({
      deadline: {
        [Op.gt]: referenceDate,
        [Op.lte]: addDays(referenceDate, 7),
      },
    })
  }

  if (deadlineStatus === 'scheduled') {
    queryConditions.push({
      deadline: {
        [Op.gt]: addDays(referenceDate, 7),
      },
    })
  }

  if (deadlineStatus === 'overdue') {
    queryConditions.push({
      deadline: {
        [Op.lt]: referenceDate,
      },
    })
  }

  if (deadlineStatus === 'no-deadline') {
    queryConditions.push({
      deadline: {
        [Op.is]: null,
      },
    })
  }

  if (queryConditions.length === 0) {
    return {}
  }

  if (queryConditions.length === 1) {
    return queryConditions[0]
  }

  return {
    [Op.and]: queryConditions,
  }
}

function buildArchiveWhereClause(options = {}) {
  const archivedOnly = normalizeBooleanFlag(
    options.archivedOnly ?? options.archived_only,
    false,
  )
  const includeArchived = normalizeBooleanFlag(
    options.includeArchived ?? options.include_archived,
    false,
  )

  if (archivedOnly) {
    return {
      is_archived: {
        [Op.eq]: true,
      },
    }
  }

  if (includeArchived) {
    return {}
  }

  return {
    [Op.or]: [
      {
        is_archived: {
          [Op.eq]: false,
        },
      },
      {
        is_archived: {
          [Op.is]: null,
        },
      },
    ],
  }
}

function buildCombinedWhereClause(options = {}) {
  const contentWhereClause = buildWhereClause(options)
  const archiveWhereClause = buildArchiveWhereClause(options)
  const clauses = [contentWhereClause, archiveWhereClause].filter(
    (clause) => clause && Object.keys(clause).length > 0,
  )

  if (clauses.length === 0) {
    return {}
  }

  if (clauses.length === 1) {
    return clauses[0]
  }

  return {
    [Op.and]: clauses,
  }
}

function normalizeProductIdentifier(value) {
  const parsedIdentifier = Number.parseInt(String(value || ''), 10)

  if (!Number.isInteger(parsedIdentifier) || parsedIdentifier <= 0) {
    throw createHttpError(400, 'Invalid product identifier.')
  }

  return parsedIdentifier
}

async function getAllProducts(options = {}) {
  const products = await ProductDevelopmentProduct.findAll({
    where: buildCombinedWhereClause(options),
  })

  return sortSerializedProducts(products.map((product) => serializeProduct(product)))
}

async function createProduct(payload) {
  const normalizedProductRef = getTrimmedText(payload?.product_ref ?? payload?.productRef)
  const normalizedProductName = getTrimmedText(payload?.product_name ?? payload?.productName)
  const normalizedDeadline = normalizeDeadline(payload?.deadline ?? payload?.due_date ?? payload?.dueDate)
  const normalizedCreatedByEmail = normalizeOptionalEmail(
    payload?.created_by_email ?? payload?.createdByEmail,
  )

  if (!normalizedProductRef) {
    throw createHttpError(400, 'Product reference is required.')
  }

  if (!normalizedProductName) {
    throw createHttpError(400, 'Product name is required.')
  }

  const conflictingProduct = await ProductDevelopmentProduct.findOne({
    where: {
      product_ref: {
        [Op.iLike]: normalizedProductRef,
      },
    },
  })

  if (conflictingProduct) {
    throw createHttpError(409, 'A product with this reference already exists.')
  }

  const product = await ProductDevelopmentProduct.create({
    product_ref: normalizedProductRef,
    product_name: normalizedProductName,
    deadline: normalizedDeadline,
    created_by_email: normalizedCreatedByEmail,
    is_archived: false,
    archived_at: null,
  })

  return serializeProduct(product)
}

async function updateProduct(productId, payload) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const product = await ProductDevelopmentProduct.findByPk(normalizedProductId)

  if (!product) {
    throw createHttpError(404, 'Product not found.')
  }

  const nextProductRef =
    getTrimmedText(payload?.product_ref ?? payload?.productRef) ||
    getTrimmedText(product.product_ref)
  const nextProductName =
    getTrimmedText(payload?.product_name ?? payload?.productName) ||
    getTrimmedText(product.product_name)
  const nextDeadline = Object.prototype.hasOwnProperty.call(payload || {}, 'deadline') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'due_date') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'dueDate')
    ? normalizeDeadline(payload?.deadline ?? payload?.due_date ?? payload?.dueDate)
    : getTrimmedText(product.deadline)
  const nextCreatedByEmail = Object.prototype.hasOwnProperty.call(payload || {}, 'created_by_email') ||
    Object.prototype.hasOwnProperty.call(payload || {}, 'createdByEmail')
    ? normalizeOptionalEmail(payload?.created_by_email ?? payload?.createdByEmail)
    : normalizeOptionalEmail(product.created_by_email)

  if (!nextProductRef) {
    throw createHttpError(400, 'Product reference is required.')
  }

  if (!nextProductName) {
    throw createHttpError(400, 'Product name is required.')
  }

  const conflictingProduct = await ProductDevelopmentProduct.findOne({
    where: {
      id: {
        [Op.ne]: normalizedProductId,
      },
      product_ref: {
        [Op.iLike]: nextProductRef,
      },
    },
  })

  if (conflictingProduct) {
    throw createHttpError(409, 'A product with this reference already exists.')
  }

  await product.update({
    product_ref: nextProductRef,
    product_name: nextProductName,
    deadline: nextDeadline,
    created_by_email: nextCreatedByEmail,
  })

  return serializeProduct(product)
}

async function deleteProduct(productId) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const product = await ProductDevelopmentProduct.findByPk(normalizedProductId)

  if (!product) {
    throw createHttpError(404, 'Product not found.')
  }

  const serializedProduct = serializeProduct(product)
  await product.destroy()

  return serializedProduct
}

async function archiveProduct(productId) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const product = await ProductDevelopmentProduct.findByPk(normalizedProductId)

  if (!product) {
    throw createHttpError(404, 'Product not found.')
  }

  await product.update({
    is_archived: true,
    archived_at: new Date(),
  })

  return serializeProduct(product)
}

async function restoreProduct(productId) {
  const normalizedProductId = normalizeProductIdentifier(productId)
  const product = await ProductDevelopmentProduct.findByPk(normalizedProductId)

  if (!product) {
    throw createHttpError(404, 'Product not found.')
  }

  await product.update({
    is_archived: false,
    archived_at: null,
  })

  return serializeProduct(product)
}

module.exports = {
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  archiveProduct,
  restoreProduct,
}
