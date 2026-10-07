import React from 'react'

function CustomPagination({ page, totalPages, handlePageRoute }) {
    return (
        <>
            {totalPages > 1 &&
                <div id="app" class="container px-0">
                    {totalPages < 8 ? (
                        <ul class="page mx-0">
                            <li className={`page__btn ${page <= 1 ? 'd-none' : 'd-flex'}`}>
                                <i
                                    className="fas fa-angle-left"
                                    onClick={() => {
                                        handlePageRoute(page - 1);
                                    }}
                                />
                            </li>
                            {[...Array(totalPages)].map((_, i) => (
                                <li
                                    key={i}
                                    className={`page__numbers ${page === i + 1 ? 'active' : ''}`}
                                    onClick={() => handlePageRoute(i + 1)}
                                >
                                    {i + 1}
                                </li>
                            ))}

                            <li
                                class={"page__btn " + (page >= totalPages ? "d-none" : "d-flex")}
                                onClick={() => {
                                    handlePageRoute(page - 1 + 2);
                                }}
                            >
                                <i className="fas fa-angle-right"></i>
                            </li>
                        </ul>
                    ) : (
                        <ul class="page mx-0">
                            <li class={"page__btn " + (page <= 1 ? "d-none" : "d-flex")}>
                                <i
                                    className="fas fa-angle-left"
                                    onClick={() => {
                                        handlePageRoute(page - 1);
                                    }}
                                />
                            </li>
                            {page >= 5 &&
                                <>
                                    <li
                                        className="page__numbers"
                                        onClick={() => handlePageRoute(1)}
                                    >
                                        1
                                    </li>
                                    <li className="page__dots">...</li>
                                </>
                            }
                            {
                                page < 5 && [1, 2, 3, 4, 5].map((i) => (
                                    <React.Fragment key={i}>
                                        {i === page ? (
                                            <li className="page__numbers active">{i}</li>
                                        ) : (
                                            <li
                                                className="page__numbers"
                                                onClick={() => handlePageRoute(i)}
                                            >
                                                {i}
                                            </li>
                                        )}
                                    </React.Fragment>))
                            }
                            {page >= 5 && page < totalPages - 3 &&
                                [page - 1, page, page + 1].map((i) => (
                                    <React.Fragment key={i}>
                                        {i === page ? (
                                            <li className="page__numbers active">{i}</li>
                                        ) : (
                                            <li
                                                className="page__numbers"
                                                onClick={() => handlePageRoute(i)}
                                            >
                                                {i}
                                            </li>
                                        )}
                                    </React.Fragment>
                                ))
                            }
                            {
                                page >= totalPages - 3 && [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1].map((i) => (
                                    <React.Fragment key={i}>
                                        {i === page ? (
                                            <li className="page__numbers active">{i}</li>
                                        ) : (
                                            <li
                                                className="page__numbers"
                                                onClick={() => handlePageRoute(i)}
                                            >
                                                {i}
                                            </li>
                                        )}
                                    </React.Fragment>
                                ))}
                            {page < totalPages - 3 && <li className="page__dots">...</li>}
                            {page == totalPages ? (
                                <li className="page__numbers active">{totalPages}</li>
                            ) : (
                                <li
                                    className="page__numbers"
                                    onClick={() => handlePageRoute(totalPages)}
                                >
                                    {totalPages}
                                </li>
                            )}
                            <li
                                class={"page__btn " + (page >= totalPages ? "d-none" : "d-flex")}
                                onClick={() => {
                                    handlePageRoute(page + 1);
                                }}
                            >
                                <i className="fas fa-angle-right"></i>
                            </li>
                        </ul>
                    )}
                </div>
            }
        </>
    )
}

export default CustomPagination
